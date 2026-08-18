#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'
export PATH='/usr/sbin:/usr/bin:/sbin:/bin'
umask 077

readonly PROJECT_NAME='easy-mes'
readonly STACK_DIR='/opt/easy-mes'
readonly COMPOSE_FILE="${STACK_DIR}/compose.prod.yml"
readonly RELEASE_ENV="${STACK_DIR}/release.env"
readonly DEPLOY_ENV='/etc/easy-mes/deploy.env'
readonly API_ENV='/etc/easy-mes/api.env'
readonly MYSQL_ENV='/etc/easy-mes/mysql.env'
readonly MINIO_ENV='/etc/easy-mes/minio.env'
readonly MINIO_LICENSE='/etc/easy-mes/minio.license'
readonly LOCK_FILE='/run/lock/easy-mes-deploy.lock'
readonly HEALTH_ATTEMPTS=30
readonly HEALTH_INTERVAL_SECONDS=2

candidate_env=''
previous_env=''
had_previous_release=false

log() {
  printf '[%s] %s\n' "$(date --iso-8601=seconds)" "$*"
}

fail() {
  printf '[%s] ERROR: %s\n' "$(date --iso-8601=seconds)" "$*" >&2
  exit 1
}

cleanup() {
  if [[ -n "${candidate_env}" && -e "${candidate_env}" ]]; then
    rm -f -- "${candidate_env}"
  fi
  if [[ -n "${previous_env}" && -e "${previous_env}" ]]; then
    rm -f -- "${previous_env}"
  fi
}

trap cleanup EXIT

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command is missing: $1"
}

require_root_owned_control_file() {
  local file="$1"
  local uid mode

  [[ -s "${file}" ]] || fail "required file is missing or empty: ${file}"
  uid="$(stat -c '%u' -- "${file}")"
  mode="$(stat -c '%a' -- "${file}")"

  [[ "${uid}" == '0' ]] || fail "file must be owned by root: ${file}"
  (( (8#${mode} & 022) == 0 )) || fail "file must not be writable by group or others: ${file}"
}

require_root_only_secret_file() {
  local file="$1"
  local uid mode

  [[ -s "${file}" ]] || fail "required secret file is missing or empty: ${file}"
  uid="$(stat -c '%u' -- "${file}")"
  mode="$(stat -c '%a' -- "${file}")"

  [[ "${uid}" == '0' ]] || fail "secret file must be owned by root: ${file}"
  (( (8#${mode} & 077) == 0 )) || fail "secret file must not be accessible by group or others: ${file}"
}

read_env_value() {
  local file="$1"
  local key="$2"

  awk -v wanted="${key}" '
    /^[[:space:]]*(#|$)/ { next }
    {
      separator = index($0, "=")
      if (separator == 0) { next }
      name = substr($0, 1, separator - 1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", name)
      if (name == wanted) {
        value = substr($0, separator + 1)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
        print value
        exit
      }
    }
  ' "${file}"
}

compose() {
  local env_file="$1"
  shift
  docker compose \
    --project-name "${PROJECT_NAME}" \
    --env-file "${DEPLOY_ENV}" \
    --env-file "${env_file}" \
    --file "${COMPOSE_FILE}" \
    "$@"
}

write_candidate_release() {
  local image="$1"

  candidate_env="$(mktemp "${STACK_DIR}/.release.env.candidate.XXXXXX")"
  if [[ -f "${RELEASE_ENV}" ]]; then
    awk '$0 !~ /^[[:space:]]*API_IMAGE=/' "${RELEASE_ENV}" >"${candidate_env}"
  fi
  printf 'API_IMAGE=%s\n' "${image}" >>"${candidate_env}"
  chown root:root "${candidate_env}"
  chmod 600 "${candidate_env}"
}

api_is_healthy() {
  local attempt

  for ((attempt = 1; attempt <= HEALTH_ATTEMPTS; attempt += 1)); do
    if compose "${RELEASE_ENV}" exec -T api node -e \
      "fetch('http://127.0.0.1:3000/api/health/live').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))" \
      >/dev/null 2>&1; then
      return 0
    fi
    sleep "${HEALTH_INTERVAL_SECONDS}"
  done

  return 1
}

restore_previous_api() {
  log 'API update failed; restoring the previous application release.'

  if [[ "${had_previous_release}" == true ]]; then
    install -o root -g root -m 600 "${previous_env}" "${RELEASE_ENV}"
    if ! compose "${RELEASE_ENV}" up -d --no-deps api; then
      log 'CRITICAL: restoring the previous API container also failed.'
      return 1
    fi
    if ! api_is_healthy; then
      log 'CRITICAL: the restored API did not pass its liveness check.'
      compose "${RELEASE_ENV}" logs --tail=100 api >&2 || true
      return 1
    fi
    log 'Previous API release restored. Database migrations were not rolled back.'
    return 0
  fi

  compose "${RELEASE_ENV}" stop api >/dev/null 2>&1 || true
  rm -f -- "${RELEASE_ENV}"
  log 'No previous API release existed; the failed first-deployment container was stopped.'
}

main() {
  local digest repository image

  [[ "${EUID}" -eq 0 ]] || fail 'this deployment entry point must run as root'
  [[ "$#" -eq 1 ]] || fail 'usage: deploy-api.sh sha256:<64 lowercase hexadecimal characters>'

  digest="$1"
  [[ "${digest}" =~ ^sha256:[0-9a-f]{64}$ ]] || fail 'invalid image digest'

  require_command awk
  require_command docker
  require_command flock
  require_command install
  require_command mktemp
  require_command stat

  docker compose version >/dev/null 2>&1 || fail 'Docker Compose plugin is unavailable'

  exec 9>"${LOCK_FILE}"
  flock -n 9 || fail 'another easy-mes deployment is already running'

  require_root_owned_control_file "${COMPOSE_FILE}"
  require_root_only_secret_file "${DEPLOY_ENV}"
  require_root_only_secret_file "${API_ENV}"
  require_root_only_secret_file "${MYSQL_ENV}"
  require_root_only_secret_file "${MINIO_ENV}"
  require_root_only_secret_file "${MINIO_LICENSE}"

  repository="$(read_env_value "${DEPLOY_ENV}" 'API_IMAGE_REPOSITORY')"
  repository="${repository%/}"
  [[ "${repository}" =~ ^(docker\.io/)?[a-z0-9]+([._-][a-z0-9]+)*/easy-mes-api$ ]] || \
    fail 'API_IMAGE_REPOSITORY must be a Docker Hub easy-mes-api repository'
  [[ "${repository}" == docker.io/* ]] || repository="docker.io/${repository}"
  image="${repository}@${digest}"

  if [[ -f "${RELEASE_ENV}" ]]; then
    require_root_only_secret_file "${RELEASE_ENV}"
    previous_env="$(mktemp "${STACK_DIR}/.release.env.previous.XXXXXX")"
    install -o root -g root -m 600 "${RELEASE_ENV}" "${previous_env}"
    had_previous_release=true
  fi

  write_candidate_release "${image}"
  log "Validating Compose configuration for ${image}."
  compose "${candidate_env}" config --quiet

  log 'Pulling the immutable API image.'
  compose "${candidate_env}" pull api

  log 'Starting MySQL and MinIO.'
  compose "${candidate_env}" up -d --wait mysql minio

  log 'Running database migrations with the candidate API image.'
  compose "${candidate_env}" run --rm --no-deps api \
    node node_modules/@company/database/dist/migrate.js

  log 'Ensuring the private technical-file bucket exists.'
  compose "${candidate_env}" run --rm --no-deps api \
    node dist/scripts/ensure-technical-file-bucket.js

  log 'Migrations succeeded; activating the candidate release.'
  mv -f -- "${candidate_env}" "${RELEASE_ENV}"
  candidate_env=''
  chown root:root "${RELEASE_ENV}"
  chmod 600 "${RELEASE_ENV}"

  if ! compose "${RELEASE_ENV}" up -d --no-deps api; then
    restore_previous_api
    fail 'API container update failed'
  fi

  log 'Waiting for API liveness.'
  if ! api_is_healthy; then
    compose "${RELEASE_ENV}" logs --tail=100 api >&2 || true
    restore_previous_api
    fail 'candidate API did not pass its liveness check'
  fi

  log "Deployment completed successfully: ${image}"
  compose "${RELEASE_ENV}" ps api
}

main "$@"
