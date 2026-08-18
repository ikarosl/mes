#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'
export PATH='/usr/sbin:/usr/bin:/sbin:/bin'
umask 077

readonly PROJECT_NAME='easy-mes'
readonly STACK_DIR='/opt/easy-mes'
readonly DEPLOY_ENV='/etc/easy-mes/deploy.env'
readonly RELEASE_ENV="${STACK_DIR}/release.env"
readonly LOCK_FILE='/run/lock/easy-mes-deploy.lock'

revision=''
bundle_dir=''
backup_dir=''

log() {
  printf '[%s] %s\n' "$(date --iso-8601=seconds)" "$*"
}

fail() {
  printf '[%s] ERROR: %s\n' "$(date --iso-8601=seconds)" "$*" >&2
  exit 1
}

cleanup() {
  if [[ -n "${backup_dir}" && -d "${backup_dir}" ]]; then
    rm -rf --one-file-system -- "${backup_dir}"
  fi
  if [[ -n "${bundle_dir}" && -d "${bundle_dir}" ]]; then
    rm -rf --one-file-system -- "${bundle_dir}"
  fi
}

trap cleanup EXIT

require_regular_bundle_file() {
  local file="$1"
  [[ -f "${file}" && ! -L "${file}" ]] || fail "bundle file must be regular and not a symlink: ${file}"
}

compose_with() {
  local compose_file="$1"
  shift
  local -a args=(
    --project-name "${PROJECT_NAME}"
    --env-file "${DEPLOY_ENV}"
  )
  if [[ -s "${RELEASE_ENV}" ]]; then
    args+=(--env-file "${RELEASE_ENV}")
  fi
  docker compose "${args[@]}" --file "${compose_file}" "$@"
}

restore_control_files() {
  local name
  for name in compose.prod.yml deploy-api.sh deploy-web.sh apply-control.sh; do
    if [[ -f "${backup_dir}/${name}" ]]; then
      install -o root -g root -m "$([[ "${name}" == *.yml ]] && printf 644 || printf 755)" \
        "${backup_dir}/${name}" "${STACK_DIR}/${name}"
    else
      rm -f -- "${STACK_DIR}/${name}"
    fi
  done
}

main() {
  local name mode
  [[ "${EUID}" -eq 0 ]] || fail 'apply-control.sh must run as root'
  [[ "$#" -eq 1 ]] || fail 'usage: apply-control.sh <40-character Git SHA>'
  revision="$1"
  [[ "${revision}" =~ ^[0-9a-f]{40}$ ]] || fail 'invalid Git revision'
  bundle_dir="/tmp/easy-mes-control-${revision}"
  [[ -d "${bundle_dir}" && ! -L "${bundle_dir}" ]] || fail "control bundle is missing: ${bundle_dir}"

  command -v docker >/dev/null 2>&1 || fail 'docker is required'
  command -v flock >/dev/null 2>&1 || fail 'flock is required'
  docker compose version >/dev/null 2>&1 || fail 'Docker Compose plugin is unavailable'

  for name in compose.prod.yml deploy-api.sh deploy-web.sh apply-control.sh; do
    require_regular_bundle_file "${bundle_dir}/${name}"
  done
  bash -n "${bundle_dir}/deploy-api.sh" "${bundle_dir}/deploy-web.sh" \
    "${bundle_dir}/apply-control.sh"
  compose_with "${bundle_dir}/compose.prod.yml" config --quiet

  exec 9>"${LOCK_FILE}"
  flock -n 9 || fail 'another easy-mes deployment is already running'

  backup_dir="$(mktemp -d "${STACK_DIR}/.control-backup.XXXXXX")"
  for name in compose.prod.yml deploy-api.sh deploy-web.sh apply-control.sh; do
    [[ ! -f "${STACK_DIR}/${name}" ]] || install -m 600 "${STACK_DIR}/${name}" "${backup_dir}/${name}"
  done

  for name in compose.prod.yml deploy-api.sh deploy-web.sh apply-control.sh; do
    mode=755
    [[ "${name}" != *.yml ]] || mode=644
    install -o root -g root -m "${mode}" "${bundle_dir}/${name}" "${STACK_DIR}/${name}"
  done

  if [[ -s "${RELEASE_ENV}" ]]; then
    log 'Reconciling the running stack with the updated Compose definition.'
    if ! compose_with "${STACK_DIR}/compose.prod.yml" up -d --wait; then
      log 'Control update failed; restoring the previous files.'
      restore_control_files
      compose_with "${STACK_DIR}/compose.prod.yml" up -d --wait || true
      fail 'updated Compose stack did not become healthy'
    fi
  fi

  log "Server control files updated from revision ${revision}."
}

main "$@"
