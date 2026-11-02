#!/usr/bin/env bash

# 维护后的应用恢复入口：resume-api.sh 'sha256:<digest>' --database-reviewed。
# 先人工核对/恢复数据库，再在 api.env 选库、release.env 选择匹配的 API/Web 镜像。
# 本脚本只核对迁移状态并启动服务，不执行迁移、down，也不把失败记录改为成功。
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
[[ "$#" == 2 && "$1" =~ ^sha256:[0-9a-f]{64}$ && "$2" == --database-reviewed ]] || \
  mes_fail 'usage: resume-api.sh sha256:<64 lowercase hexadecimal characters> --database-reviewed'
digest="$1"
resume_started=false
resume_successful=false
cleanup_resume() {
  local status="$?"
  trap - EXIT INT TERM
  # 恢复中断或检查失败仍保持停写，不让部分启动的服务承接请求。
  if [[ "${resume_started}" == true && "${resume_successful}" != true ]]; then
    MES_COMMAND_TIMEOUT=80 mes_compose stop --timeout 60 web api >/dev/null 2>&1 || \
      mes_log 'CRITICAL: stopping services failed; isolate traffic before recovery.' >&2
    mes_log 'API recovery did not complete; maintenance remains active.' >&2
  fi
  exit "${status}"
}
trap cleanup_resume EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
mes_require_runtime
mes_take_lock
# 必须有未结束的维护记录；命令 digest 必须与人工选定的 API_IMAGE 一致。
mes_require_file "${MES_MAINTENANCE_FILE}" true
resume_started=true
[[ "$(mes_current_image)" == *@"${digest}" ]] || mes_fail 'digest must match the API_IMAGE explicitly selected in release.env'
mes_stop_api
# 用所选镜像的 migrate-status.js 只读检查当前库，任何未完成迁移都会拒绝启动。
mes_log 'Checking the selected image against the database migration ledger.'
mes_compose run --rm --no-deps api node node_modules/@company/database/dist/migrate-status.js || \
  mes_fail 'migration status is not current; API remains stopped'
if ! mes_compose up -d --no-deps --wait api; then
  mes_compose stop --timeout 60 web api || true
  mes_fail 'API startup failed; maintenance remains active'
fi
if ! mes_wait_api_ready; then
  mes_compose stop --timeout 60 web api || true
  mes_fail 'API readiness failed; maintenance remains active'
fi
# 先 API readiness，再恢复原 Web，最后解除维护；不把进程启动等同于恢复成功。
if ! mes_restore_web; then
  mes_compose stop --timeout 60 web api || true
  mes_fail 'Web restoration failed; maintenance remains active'
fi
rm -f -- "${MES_MAINTENANCE_FILE}"
resume_successful=true
mes_log "Maintenance completed; API is ready with ${digest}."
