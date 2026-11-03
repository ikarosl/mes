#!/usr/bin/env bash

# 数据库恢复入口：restore-mysql.sh --backup '/绝对路径/完成目录' --target-database 新库名。
# --backup 必须是含 metadata/校验文件的整个目录，不是单独的 sql.gz，也不自动选最新备份。
# 只恢复到尚不存在的新库；不覆盖旧库，不自动改 api.env 的 DB_NAME 或切换应用镜像。
set -Eeuo pipefail
IFS=$'\n\t'
export PATH='/usr/sbin:/usr/bin:/sbin:/bin'
umask 077
[[ "${EUID}" == 0 ]] || { printf 'ERROR: run as root\n' >&2; exit 1; }
library="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/mysql-backup-common.sh"
[[ -f "${library}" && ! -L "${library}" && "$(stat -c '%u' -- "${library}")" == 0 ]] || exit 1
mode_bits="$(stat -c '%a' -- "${library}")"
(( (8#${mode_bits} & 022) == 0 )) || exit 1
source "${library}"

[[ "$#" == 4 && "$1" == --backup && "$3" == --target-database ]] || \
  mes_fail 'usage: restore-mysql.sh --backup /absolute/completed-backup-directory --target-database new_database'
backup="$2"
target="$4"
# backup / target 来自命令参数，不从环境变量猜测；目标库名也不能是系统库。
[[ "${backup}" == /* && -d "${backup}" && ! -L "${backup}" ]] || mes_fail 'backup must be an absolute regular directory'
[[ "${target}" =~ ^[A-Za-z0-9_]{1,64}$ ]] || mes_fail 'target database must use 1-64 ASCII letters, digits or underscores'
case "${target}" in mysql|sys|information_schema|performance_schema) mes_fail 'system database names are forbidden';; esac
mes_require_runtime
mes_take_lock
MES_BACKUP_DEADLINE_EPOCH=$(( $(date +%s) + 1200 ))
format="$(awk -F= '$1=="format_version" {print $2; exit}' "${backup}/metadata.env")"
backup_files=(database.sql.gz metadata.env objects.tsv rows.tsv)
case "${format}" in
  1) ;; # 已有 SQL-only 备份仍可恢复，不能当作包含附件的恢复点。
  2) backup_files+=(minio.tar.gz);;
  *) mes_fail 'unsupported backup format';;
esac
for name in "${backup_files[@]}" SHA256SUMS; do
  # 首次部署空库的对象/行数清单可以为空，但全部文件都必须存在且受保护。
  [[ -f "${backup}/${name}" && ! -L "${backup}/${name}" ]] || mes_fail "backup file is missing: ${name}"
  [[ "$(stat -c '%u' -- "${backup}/${name}")" == 0 ]] || mes_fail 'backup files must be owned by root'
  mode_bits="$(stat -c '%a' -- "${backup}/${name}")"
  (( (8#${mode_bits} & 077) == 0 )) || mes_fail 'backup files must only be accessible by root'
done
# 先校验对应格式的固定文件及压缩包，再接触目标库；不跟随清单中的任意路径。
[[ "$(awk '{print $2}' "${backup}/SHA256SUMS")" == "$(printf '%s\n' "${backup_files[@]}")" ]] || \
  mes_fail 'backup checksum manifest has unexpected entries'
(cd -- "${backup}" && sha256sum --check --status SHA256SUMS) || mes_fail 'backup checksum validation failed'
gzip -t "${backup}/database.sql.gz" || mes_fail 'compressed dump validation failed'
metadata_value() { awk -F= -v wanted="$1" '$1 == wanted {print substr($0,index($0,"=")+1); exit}' "${backup}/metadata.env"; }
# metadata.env 是本份备份的数据说明，按文本取值，不当 shell 配置执行。
[[ "$(metadata_value format_version)" == "${format}" ]] || mes_fail 'backup format changed during validation'
source_database="$(metadata_value source_database)"
charset="$(metadata_value character_set)"
collation="$(metadata_value collation)"
[[ "${source_database}" =~ ^[A-Za-z0-9_]{1,64}$ && "${charset}" =~ ^[A-Za-z0-9_]+$ && "${collation}" =~ ^[A-Za-z0-9_]+$ ]] || mes_fail 'invalid backup database metadata'
[[ "${target}" != "${source_database}" && "${target}" != "$(mes_source_database)" ]] || mes_fail 'restore target must differ from both the source and configured application database'
[[ "$(mes_mysql --execute="SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='${target}'")" == 0 ]] || \
  mes_fail 'restore target already exists; only a new database is permitted'
if awk -F '\t' '$1 == "event" {found=1} END {exit !found}' "${backup}/objects.tsv"; then
  [[ "$(mes_mysql --execute='SELECT @@GLOBAL.event_scheduler')" =~ ^(OFF|DISABLED)$ ]] || \
    mes_fail 'backup contains events and requires event_scheduler=OFF; use an isolated restore instance when production needs events'
fi
# 拒绝会选回源库的 USE / CREATE DATABASE 和带源库名的引用，避免恢复时写错库。
if gzip -cd "${backup}/database.sql.gz" | awk -v source="${source_database}" '
  /^[[:space:]]*(\/\*![0-9]+[[:space:]]+)?(USE|CREATE[[:space:]]+DATABASE)[[:space:]]/ { found=1 }
  index($0,"`" source "`.") { found=1 }
  $0 ~ ("(^|[^A-Za-z0-9_])" source "[.]") { found=1 }
  END { exit !found }
'; then mes_fail 'dump selects/creates a database or contains source-qualified references; review it on an isolated instance'; fi

work="$(mktemp -d "${MES_STACK_DIR}/.restore-verification.XXXXXX")"
cleanup() { rm -rf --one-file-system -- "${work}"; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
# 检查全部通过才创建新库；中途失败保留部分恢复库供排查，重试需另取新库名。
mes_log "Creating new restore database ${target}; existing databases remain untouched."
mes_mysql --execute="CREATE DATABASE \`${target}\` CHARACTER SET ${charset} COLLATE ${collation}" \
  2>"${work}/diagnostic.log" || mes_fail 'creating the new restore database failed'
if ! gzip -cd "${backup}/database.sql.gz" | mes_mysql --binary-mode --database="${target}" 2>"${work}/diagnostic.log"; then
  mes_fail "restore failed; partial database ${target} is retained for inspection and will not be overwritten"
fi
# 对象定义及逐表行数须与本份备份一致；验证成功仍需人工切库和业务核验。
mes_write_inventory "${target}" "${work}" 2>"${work}/diagnostic.log"
cmp --silent "${backup}/objects.tsv" "${work}/objects.tsv" || mes_fail 'restored objects/trigger ordering/SQL_MODE/charset do not match the backup'
cmp --silent "${backup}/rows.tsv" "${work}/rows.tsv" || mes_fail 'restored per-table row counts do not match the backup'
mes_log "Restore verified in ${target}: objects and every table row count match. The application has not been switched."
