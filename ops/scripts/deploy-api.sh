#!/usr/bin/env bash

# API 发布统一入口：CD 和手动操作都执行 deploy-api.sh 'sha256:<digest>'。
# 顺序：准备镜像 → 停写 → 完整备份成功 → 迁移 → 切换 API → 检查后恢复入口。
# 备份使用与 backup-mysql.sh 相同的 mes_create_backup；不能只在 CI 中安排备份。
# 维护后的失败保持停写，由 restore-mysql.sh / resume-api.sh 完成人工恢复。
set -Eeuo pipefail
IFS=$'\n\t'
export PATH='/usr/sbin:/usr/bin:/sbin:/bin'
umask 077
readonly STACK_DIR='/opt/easy-mes'
readonly RELEASE_ENV="${STACK_DIR}/release.env"
candidate_env=''
maintenance_started=false

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
[[ "${EUID}" == 0 ]] || fail 'deploy-api.sh must run as root'
library="${STACK_DIR}/mysql-backup-common.sh"
# 共享脚本会以 root 身份执行，加载前先核对文件归属与写权限。
[[ -f "${library}" && ! -L "${library}" && "$(stat -c '%u' -- "${library}")" == 0 ]] || fail 'trusted MySQL maintenance library is missing'
mode_bits="$(stat -c '%a' -- "${library}")"
(( (8#${mode_bits} & 022) == 0 )) || fail 'MySQL maintenance library must not be writable by group or others'
source "${library}"

cleanup() {
  local status="$?"
  trap - EXIT INT TERM
  if [[ "${status}" != 0 && "${maintenance_started}" == true ]]; then
    # DDL 可能已经提交；只停止应用，不自动换回旧镜像，也不执行 migration down。
    MES_COMMAND_TIMEOUT=80 mes_compose stop --timeout 60 web api >/dev/null 2>&1 || \
      mes_log 'CRITICAL: stopping API failed; isolate traffic before further recovery.' >&2
    mes_log 'Release failed; maintenance remains active. Review the database and selected image before manual recovery.' >&2
  fi
  [[ -z "${candidate_env}" || ! -f "${candidate_env}" ]] || rm -f -- "${candidate_env}"
  if [[ "${status}" != 0 ]]; then mes_notify_failure api-release "${status}"; fi
  exit "${status}"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

[[ "$#" == 1 && "$1" =~ ^sha256:[0-9a-f]{64}$ ]] || fail 'usage: deploy-api.sh sha256:<64 lowercase hexadecimal characters>'
digest="$1"
mes_require_runtime
# 从备份到迁移、启动全程持有同一把宿主机锁，避免其他维护任务插入。
mes_take_lock
# API_IMAGE_REPOSITORY 来自 deploy.env；digest 来自命令参数（CD 使用构建产物）。
repository="$(awk -F= '$1 == "API_IMAGE_REPOSITORY" {print substr($0,index($0,"=")+1); exit}' /etc/easy-mes/deploy.env)"
repository="${repository%/}"
[[ "${repository}" =~ ^(docker\.io/)?[a-z0-9]+([._-][a-z0-9]+)*/easy-mes-api$ ]] || fail 'API_IMAGE_REPOSITORY must be a Docker Hub easy-mes-api repository'
[[ "${repository}" == docker.io/* ]] || repository="docker.io/${repository}"
image="${repository}@${digest}"
# 候选配置只替换 API_IMAGE，保留当前 WEB_IMAGE；成功前不覆盖 release.env。
candidate_env="$(mktemp "${STACK_DIR}/.release.env.candidate.XXXXXX")"
if [[ -f "${RELEASE_ENV}" ]]; then
  awk '$0 !~ /^[[:space:]]*API_IMAGE=/' "${RELEASE_ENV}" >"${candidate_env}"
fi
printf 'API_IMAGE=%s\n' "${image}" >>"${candidate_env}"
chown root:root "${candidate_env}"
chmod 600 "${candidate_env}"
MES_COMPOSE_ENV="${candidate_env}"
mes_log "Validating Compose configuration for ${image}."
mes_compose config --quiet
mes_log 'Pulling the immutable API image.'
mes_compose pull api
# 准备阶段允许启动缺失或停止的依赖；既有 MySQL/MinIO 不随应用发布重建升级。
mes_compose up -d --no-recreate --wait mysql minio
# 先记录原服务状态并停止 Web/API；release 备份完成后也保持停写。
mes_begin_maintenance api-release "${image}"
maintenance_started=true
mes_stop_api
# 这是迁移前的必经步骤；失败会退出，下面的迁移和应用切换都不会执行。
# 备份目录由共享函数打印 Backup completed: ...，恢复时显式传给 --backup。
mes_create_backup release "${image}"
# 使用本次候选镜像中的 SQL 和运行器，连接参数由 Compose 的 api.env 提供。
mes_log 'Running database migrations with the candidate API image.'
mes_compose run --rm --no-deps api node node_modules/@company/database/dist/migrate.js
mes_compose run --rm --no-deps api node node_modules/@company/database/dist/migrate-status.js
mes_log 'Ensuring the private technical-file bucket exists.'
mes_compose run --rm --no-deps api node dist/scripts/ensure-technical-file-bucket.js
# 迁移、状态与 Bucket 检查均通过后，才正式替换应用镜像记录。
mes_log 'Activating the candidate API release.'
mv -f -- "${candidate_env}" "${RELEASE_ENV}"
candidate_env=''
MES_COMPOSE_ENV="${RELEASE_ENV}"
mes_compose up -d --no-deps --wait api
mes_wait_api_ready || mes_fail 'candidate API did not pass readiness'
# API readiness 成功后才恢复维护前运行的 Web，最后移除维护标记。
mes_restore_web
rm -f -- "${MES_MAINTENANCE_FILE}"
# 发布失败的留证备份不触发轮换，避免连续失败重试挤掉发布前恢复点。
maintenance_started=false
mes_prune_backups release
mes_log "Deployment completed successfully: ${image}"
mes_compose ps api || true
