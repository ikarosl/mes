#!/usr/bin/env bash

# CD 的控制文件更新入口：把上传包中的脚本、Compose 和备份单元安装到服务器。
# 这里只协调原来运行的 API/Web，不发布新应用镜像、不迁移数据库，也不启用 timer。
# 本文件的 backup_dir 是控制文件临时副本，不是 MySQL 业务数据备份。
set -Eeuo pipefail
IFS=$'\n\t'
export PATH='/usr/sbin:/usr/bin:/sbin:/bin'
umask 077
readonly STACK_DIR='/opt/easy-mes'
readonly LOCK_FILE='/run/lock/easy-mes-deploy.lock'
readonly UNIT_DIR='/etc/systemd/system'
readonly -a CONTROL_FILES=(compose.prod.yml deploy-api.sh deploy-web.sh apply-control.sh
  mysql-backup-common.sh minio-backup-common.sh minio-backup.mjs backup-mysql.sh
  restore-mysql.sh restore-minio.sh notify-backup-failure.sh resume-api.sh)
readonly -a UNIT_FILES=(easy-mes-mysql-backup.service easy-mes-mysql-backup.timer)
bundle_dir=''
backup_dir=''
files_changed=false
successful=false

log() { printf '[%s] %s\n' "$(date --iso-8601=seconds)" "$*"; }
fail() { log "ERROR: $*" >&2; exit 1; }
reload_units() {
  if [[ -d /run/systemd/system ]]; then systemctl daemon-reload; fi
}
restore_files() {
  # 控制文件更新失败时恢复旧文件；数据库恢复必须另用 restore-mysql.sh。
  local name target mode
  for name in "${CONTROL_FILES[@]}" "${UNIT_FILES[@]}"; do
    target="${STACK_DIR}/${name}"
    mode=750
    if [[ "${name}" == *.yml ]]; then mode=644; fi
    if [[ "${name}" == *.service || "${name}" == *.timer ]]; then target="${UNIT_DIR}/${name}"; mode=644; fi
    if [[ -f "${backup_dir}/${name}" ]]; then
      install -o root -g root -m "${mode}" "${backup_dir}/${name}" "${target}"
    else
      rm -f -- "${target}"
    fi
  done
  reload_units
}
cleanup() {
  local status="$?"
  trap - EXIT INT TERM
  if [[ "${successful}" != true && "${files_changed}" == true ]]; then
    restore_files || log 'CRITICAL: restoring previous control files failed; manual repair is required.' >&2
  fi
  [[ -z "${backup_dir}" || ! -d "${backup_dir}" ]] || rm -rf --one-file-system -- "${backup_dir}"
  [[ -z "${bundle_dir}" || ! -d "${bundle_dir}" ]] || rm -rf --one-file-system -- "${bundle_dir}"
  exit "${status}"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
compose_with() {
  local compose_file="$1"
  shift
  local -a args=(--project-name easy-mes --env-file /etc/easy-mes/deploy.env)
  if [[ -s "${STACK_DIR}/release.env" ]]; then args+=(--env-file "${STACK_DIR}/release.env"); fi
  timeout --foreground --signal=TERM --kill-after=10s 600s docker compose "${args[@]}" --file "${compose_file}" "$@"
}

[[ "${EUID}" == 0 ]] || fail 'apply-control.sh must run as root'
[[ "$#" == 1 && "$1" =~ ^[0-9a-f]{40}$ ]] || fail 'usage: apply-control.sh <40-character Git SHA>'
revision="$1"
bundle_dir="/tmp/easy-mes-control-${revision}"
[[ -d "${bundle_dir}" && ! -L "${bundle_dir}" ]] || fail 'control bundle is missing or a symlink'
for command in docker flock timeout; do command -v "${command}" >/dev/null 2>&1 || fail "${command} is required"; done
exec 9>"${LOCK_FILE}"
flock -n 9 || fail 'another easy-mes deployment or maintenance task is running'
[[ ! -e "${STACK_DIR}/mysql-maintenance.state" ]] || fail 'database maintenance is active; control updates cannot restart services'
# 全部文件先检查，再替换；已有维护状态时拒绝重启应用。
for name in "${CONTROL_FILES[@]}" "${UNIT_FILES[@]}"; do
  [[ -f "${bundle_dir}/${name}" && ! -L "${bundle_dir}/${name}" ]] || fail "bundle file must be regular: ${name}"
  if [[ "${name}" == *.sh ]]; then bash -n "${bundle_dir}/${name}"; fi
 done
compose_with "${bundle_dir}/compose.prod.yml" config --quiet
running_services="$(compose_with "${STACK_DIR}/compose.prod.yml" ps --services --status running)"
applications=()
while IFS= read -r name; do
  case "${name}" in api|web) applications+=("${name}");; esac
 done <<<"${running_services}"
backup_dir="$(mktemp -d "${STACK_DIR}/.control-backup.XXXXXX")"
for name in "${CONTROL_FILES[@]}" "${UNIT_FILES[@]}"; do
  target="${STACK_DIR}/${name}"
  if [[ "${name}" == *.service || "${name}" == *.timer ]]; then target="${UNIT_DIR}/${name}"; fi
  [[ ! -f "${target}" ]] || install -m 600 "${target}" "${backup_dir}/${name}"
 done
files_changed=true
for name in "${CONTROL_FILES[@]}" "${UNIT_FILES[@]}"; do
  target="${STACK_DIR}/${name}"
  mode=750
  if [[ "${name}" == *.yml ]]; then mode=644; fi
  if [[ "${name}" == *.service || "${name}" == *.timer ]]; then target="${UNIT_DIR}/${name}"; mode=644; fi
  install -o root -g root -m "${mode}" "${bundle_dir}/${name}" "${target}"
 done
reload_units
# 应用沿用 release.env 中的已选镜像；基础设施升级与数据库迁移由各自入口负责。
if [[ -s "${STACK_DIR}/release.env" && "${#applications[@]}" -gt 0 ]]; then
  log 'Reconciling only the application services that were already running.'
  if ! compose_with "${STACK_DIR}/compose.prod.yml" up -d --no-deps --force-recreate --wait "${applications[@]}"; then
    restore_files
    files_changed=false
    compose_with "${STACK_DIR}/compose.prod.yml" up -d --no-deps --wait "${applications[@]}" || true
    fail 'updated applications did not become healthy'
  fi
fi
successful=true
log "Server control files updated from revision ${revision}; no infrastructure upgrade or timer activation was performed."
