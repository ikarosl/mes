#!/usr/bin/env bash

# 恢复到隔离 MinIO 的同名新 Bucket；不覆盖现有桶，不自动修改业务配置。
# target-env 只需包含目标 S3_*，与 api.env 分开保存为 root:root 600。
set -Eeuo pipefail
IFS=$'\n\t'
export PATH='/usr/sbin:/usr/bin:/sbin:/bin'
umask 077
[[ "${EUID}" == 0 ]] || { printf 'ERROR: run as root\n' >&2; exit 1; }
library="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/mysql-backup-common.sh"
[[ -f "${library}" && ! -L "${library}" && "$(stat -c '%u' "${library}")" == 0 ]] || exit 1
mode_bits="$(stat -c '%a' "${library}")"
(( (8#${mode_bits} & 022) == 0 )) || exit 1
source "${library}"
[[ "$#" == 4 && "$1" == --backup && "$3" == --target-env ]] || \
  mes_fail 'usage: restore-minio.sh --backup /absolute/completed-directory --target-env /absolute/restore-s3.env'
backup="$2"
target_env="$4"
[[ "${backup}" == /* && -d "${backup}" && ! -L "${backup}" ]] || mes_fail 'backup must be an absolute regular directory'
[[ "${target_env}" == /* && "$(realpath "${target_env}")" != /etc/easy-mes/api.env ]] || mes_fail 'use a separate target S3 configuration'
mes_require_runtime
mes_take_lock
mes_require_file "${target_env}" true
mes_require_file "${MES_STACK_DIR}/minio-backup.mjs"
for name in metadata.env minio.tar.gz SHA256SUMS; do mes_require_file "${backup}/${name}" true; done
[[ "$(awk -F= '$1=="format_version" {print $2}' "${backup}/metadata.env")" == 2 ]] || mes_fail 'this backup has no paired MinIO archive'
[[ "$(awk '{print $2}' "${backup}/SHA256SUMS")" == $'database.sql.gz\nmetadata.env\nobjects.tsv\nrows.tsv\nminio.tar.gz' ]] || mes_fail 'unexpected backup checksum entries'
# 先核对摘要；备份包含凭证外的文件数据，不能只凭文件名开始恢复。
(cd -- "${backup}" && sha256sum --check --status SHA256SUMS) || mes_fail 'backup checksum validation failed'
work="$(mktemp -d "${MES_STACK_DIR}/.minio-restore.XXXXXX")"
container="easy-mes-minio-restore-$$-${RANDOM}"
cleanup() {
  local status="$?"
  trap - EXIT
  timeout --kill-after=5s 20s docker rm -f "${container}" >/dev/null 2>&1 || true
  rm -rf --one-file-system -- "${work}"
  exit "${status}"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
# 只接受导出器生成的目录和数字对象文件，拒绝链接、设备文件及路径穿越。
tar -tzf "${backup}/minio.tar.gz" >"${work}/entries"
awk ' !/^minio\/$/ && !/^minio\/objects\/$/ && !/^minio\/manifest\.json$/ && !/^minio\/objects\/[0-9]+\.bin$/ {exit 1}' "${work}/entries" || mes_fail 'unsupported archive path'
tar -tvzf "${backup}/minio.tar.gz" | awk 'substr($0,1,1)!="-" && substr($0,1,1)!="d" {exit 1}' || mes_fail 'archive must not contain links or special files'
tar --no-same-owner --no-same-permissions -C "${work}" -xzf "${backup}/minio.tar.gz"
image="$(mes_current_image)"
[[ "${image}" =~ @sha256:[0-9a-f]{64}$ ]] || mes_fail 'release.env must select an immutable API image'
# 目标实例须在 easy-mes_backend 网络可达。20 分钟后停止，部分恢复桶保留供诊断。
timeout --foreground --signal=TERM --kill-after=10s 1200s \
  docker run --rm --name "${container}" --network easy-mes_backend --user 0:0 \
    --env-file "${target_env}" \
    --volume "${MES_STACK_DIR}/minio-backup.mjs:/opt/minio-backup.mjs:ro" \
    --volume "${work}:/backup:ro" \
    --entrypoint node "${image}" /opt/minio-backup.mjs restore
