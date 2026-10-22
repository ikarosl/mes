#!/usr/bin/env bash

# 【用途】把管理端页面及承载它的 Nginx 更新到指定镜像版本。
# 【入口】sudo /opt/easy-mes/deploy-web.sh 'sha256:<64 位小写十六进制摘要>'
# 尖括号部分要替换成 CI 发布摘要中的真实 digest，不能原样输入。
# 镜像是打包好的程序；digest 是镜像内容的固定标识，用它精确选择要运行的版本。
# 【顺序】检查环境并加锁 → 准备候选版本 → 拉镜像 → 校验 Nginx 配置 → 切换 Web →
# 等待健康检查，失败时尝试恢复发布前的 Web 配置。
# Web 健康检查会经 Nginx 访问 API，因此首次部署要先发布 API。
# 完整操作入口：ops/runbooks/compose-server-deployment.md。
#
# 【执行环境】统一脚本运行条件和新建文件的默认保护方式，减少环境差异造成的部署问题。
# 未单独处理的执行错误会中止后续步骤；具体恢复动作见下方失败处理流程。
set -Eeuo pipefail
IFS=$'\n\t'
export PATH='/usr/sbin:/usr/bin:/sbin:/bin'
umask 077

# 【固定配置】PROJECT_NAME 标识这套服务，STACK_DIR 存放运行文件，COMPOSE_FILE 描述各服务如何运行。
# RELEASE_ENV 记录当前 API/Web 镜像；DEPLOY_ENV 提供人工维护的仓库、端口等配置。
# API_ENV、MYSQL_ENV、MINIO_ENV 分别提供后端、数据库、对象存储配置，MINIO_LICENSE 是对象存储许可证。
# LOCK_FILE 用于防止多个发布任务同时更新服务器。
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

# 【本次发布的临时状态】空字符串表示对应临时文件还没有创建。
# candidate_env 保存“本次想发布的版本配置”临时文件路径；previous_env 保存发布前的备份路径。
# had_previous_release 记录发布前是否存在 release.env 文件，供失败恢复时选择处理分支。
# 注意：这个标记只表示文件存在，不单独证明其中已经配置了当前应用的旧镜像。
candidate_env=''
previous_env=''
had_previous_release=false

# 【函数：记录进度】输出带时间的进度提示，方便查看部署进行到了哪一步，以及失败发生在什么时间。
log() {
  printf '[%s] %s\n' "$(date --iso-8601=seconds)" "$*"
}

# 【函数：报错并结束】显示失败原因并停止脚本，让人工操作或自动发布流程知道本次操作失败。
fail() {
  printf '[%s] ERROR: %s\n' "$(date --iso-8601=seconds)" "$*" >&2
  exit 1
}

# 【函数：删除临时配置】删除本次发布生成的候选配置和旧发布记录的临时副本。
# 正式 release.env、数据库和上传文件都会保留；临时备份仅供本次发布失败时恢复使用。
cleanup() {
  [[ -z "${candidate_env}" || ! -e "${candidate_env}" ]] || rm -f -- "${candidate_env}"
  [[ -z "${previous_env}" || ! -e "${previous_env}" ]] || rm -f -- "${previous_env}"
}

# 【退出时收尾】正常结束或因错误退出时清理临时文件。
# 清理不负责恢复旧版本；恢复动作由主流程中的失败分支安排。
trap cleanup EXIT

# 【函数：确认工具已安装】检查指定工具能否使用。缺少工具时提前结束，避免部署进行到一半才中断。
require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command is missing: $1"
}

# 【函数：检查控制文件权限】确认指定文件存在、非空、归 root 管理，且普通用户不能修改。
# 发布会根据这些文件启动服务，因此要避免使用缺失、空白或可被其他用户改写的控制文件。
require_root_owned_control_file() {
  local file="$1"
  local uid mode
  [[ -s "${file}" ]] || fail "required file is missing or empty: ${file}"
  uid="$(stat -c '%u' -- "${file}")"
  mode="$(stat -c '%a' -- "${file}")"
  [[ "${uid}" == '0' ]] || fail "file must be owned by root: ${file}"
  (( (8#${mode} & 022) == 0 )) || fail "file must not be writable by group or others: ${file}"
}

# 【函数：检查保密文件权限】确认配置或许可证存在、非空、归 root 管理，且不向其他用户开放权限。
# 这些文件可能包含数据库密码、服务凭证等信息。这里检查文件保护情况，不判断配置内容是否正确。
require_root_only_secret_file() {
  local file="$1"
  local uid mode
  [[ -s "${file}" ]] || fail "required secret file is missing or empty: ${file}"
  uid="$(stat -c '%u' -- "${file}")"
  mode="$(stat -c '%a' -- "${file}")"
  [[ "${uid}" == '0' ]] || fail "secret file must be owned by root: ${file}"
  (( (8#${mode} & 077) == 0 )) || fail "secret file must not be accessible by group or others: ${file}"
}

# 【函数：从配置文件取一个值】给定配置文件和配置项名称，读取第一个匹配项的值，供后续确定镜像仓库。
# 读取时跳过空行和注释，清理配置项两侧的空白。配置仅作为文本读取，不作为程序执行。
# 镜像仓库应按模板填写为不带引号的完整路径。
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

# 【函数：统一调用 Docker Compose】把项目名称、服务定义、人工配置和镜像版本配置组合起来，再执行指定操作。
# 准备阶段使用候选版本配置，切换后使用正式发布记录；这样校验、下载和启动能对应同一套版本。
# Compose 负责根据这套配置管理容器；容器内部的配置文件由服务定义另行指定。
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

# 【函数：生成候选发布记录】根据本次 Web 镜像创建临时版本配置，保留另一个应用的镜像记录。
# 先在临时文件中准备和校验，成功后再替换正式 release.env，避免准备阶段就改变正式版本记录。
# 临时配置仅允许 root 读写。
write_candidate_release() {
  local image="$1"
  candidate_env="$(mktemp "${STACK_DIR}/.release.env.candidate.XXXXXX")"
  if [[ -f "${RELEASE_ENV}" ]]; then
    awk '$0 !~ /^[[:space:]]*WEB_IMAGE=/' "${RELEASE_ENV}" >"${candidate_env}"
  fi
  printf 'WEB_IMAGE=%s\n' "${image}" >>"${candidate_env}"
  chown root:root "${candidate_env}"
  chmod 600 "${candidate_env}"
}

# 【函数：Web 切换失败后的恢复】有旧发布记录时恢复旧镜像配置，并尝试重新启动 Web。
# 没有旧发布记录时，尝试停止失败容器并删除本次发布记录；不影响数据库和 API。
# 这里不会再次确认旧 Web 的健康状态，所以尝试恢复不代表恢复成功；主流程仍报告本次发布失败。
restore_previous_web() {
  log 'Web update failed; restoring the previous release state.'
  if [[ "${had_previous_release}" == true ]]; then
    install -o root -g root -m 600 "${previous_env}" "${RELEASE_ENV}"
    compose "${RELEASE_ENV}" up -d --no-deps web || true
    return
  fi
  compose "${RELEASE_ENV}" stop web >/dev/null 2>&1 || true
  rm -f -- "${RELEASE_ENV}"
}

# 【主流程】完成一次应用发布：先检查和准备，再切换版本，最后确认服务能响应。
# digest 是本次版本标识，repository 是镜像仓库，image 是两者组合后的完整镜像地址。
main() {
  local digest repository image
  # 【步骤 1：核对身份与版本参数】要求以 root 管理员身份执行，并且只提供一个格式正确的镜像摘要。
  # 提前拒绝错误输入；镜像是否存在、是否允许下载，会在后面的下载步骤中确认。
  [[ "${EUID}" -eq 0 ]] || fail 'this deployment entry point must run as root'
  [[ "$#" -eq 1 ]] || fail 'usage: deploy-web.sh sha256:<64 lowercase hexadecimal characters>'
  digest="$1"
  [[ "${digest}" =~ ^sha256:[0-9a-f]{64}$ ]] || fail 'invalid image digest'

  # 【步骤 2：检查外部工具】确认容器管理、文件复制、配置读取和发布互斥所需的工具已经具备。
  # 工具缺失则停止，避免在更新服务器状态后才发现环境不完整。
  require_command awk
  require_command docker
  require_command flock
  require_command install
  require_command mktemp
  require_command stat

  # 【步骤 3：取得发布锁】同一时间只允许一个 API、Web 或控制文件更新任务进入发布阶段。
  # 如果另一个任务正在发布，本次直接结束，避免相互覆盖镜像记录或运行配置。
  exec 9>"${LOCK_FILE}"
  flock -n 9 || fail 'another easy-mes deployment is already running'

  # 【步骤 4：检查服务器文件】检查服务定义、人工配置和许可证是否准备齐全、权限是否符合要求。
  # 即使只发布一个应用，完整的 Compose 服务定义仍引用这些文件，因此要一起检查。
  require_root_owned_control_file "${COMPOSE_FILE}"
  require_root_only_secret_file "${DEPLOY_ENV}"
  require_root_only_secret_file "${API_ENV}"
  require_root_only_secret_file "${MYSQL_ENV}"
  require_root_only_secret_file "${MINIO_ENV}"
  require_root_only_secret_file "${MINIO_LICENSE}"

  # 【步骤 5：确定完整镜像地址】从人工配置读取 Web 镜像仓库，确认属于允许的 Docker Hub 仓库后，组合本次版本摘要。
  # 得到的地址精确对应本次要发布的镜像，避免使用会变化的 latest 标签而部署到其他版本。
  repository="$(read_env_value "${DEPLOY_ENV}" 'WEB_IMAGE_REPOSITORY')"
  repository="${repository%/}"
  [[ "${repository}" =~ ^(docker\.io/)?[a-z0-9]+([._-][a-z0-9]+)*/easy-mes-web$ ]] || \
    fail 'WEB_IMAGE_REPOSITORY must be a Docker Hub easy-mes-web repository'
  [[ "${repository}" == docker.io/* ]] || repository="docker.io/${repository}"
  image="${repository}@${digest}"

  # 【步骤 6：备份现有发布记录】保存更新前的 API/Web 镜像记录，供切换失败时恢复。
  # 这是版本配置的临时副本，不是数据库、上传文件或容器本身的备份。
  if [[ -f "${RELEASE_ENV}" ]]; then
    require_root_only_secret_file "${RELEASE_ENV}"
    previous_env="$(mktemp "${STACK_DIR}/.release.env.previous.XXXXXX")"
    install -o root -g root -m 600 "${RELEASE_ENV}" "${previous_env}"
    had_previous_release=true
  fi

  # 【步骤 7：准备并校验候选配置】先生成包含新版本的临时配置，再检查它能否被 Compose 正确解析。
  # 这一步不启动服务，也不替换正式发布记录；检查失败时直接结束。
  write_candidate_release "${image}"
  log "Validating Compose configuration for ${image}."
  compose "${candidate_env}" config --quiet
  # 【步骤 8：下载 Web 镜像】根据候选配置拉取指定 digest 的 Web 镜像。
  # 不运行数据库迁移，也不拉取 API 镜像；下载失败时正式发布记录还没有切换。
  log 'Pulling the immutable Web image.'
  compose "${candidate_env}" pull web

  # 【步骤 9：生成并检查 Nginx 配置】用候选镜像的官方入口将端口填入模板，再校验生成的配置。
  # 生成文件只存在于这次临时容器中；正式 Web 启动时会用相同环境变量重新生成，不共享文件。
  # 此时 API 应已运行，以便解析代理目标；校验失败则结束，正式镜像记录和运行中的 Web 保持原状态。
  log 'Rendering and validating Nginx configuration with the candidate Web image.'
  compose "${candidate_env}" run --rm --no-deps web nginx -t

  # 【步骤 10：正式切换镜像记录】新镜像下载并校验成功后，将候选配置替换为正式 release.env，并保护其访问权限。
  # 记录整体替换，避免读取到写了一半的内容；此时版本记录已更新，Web 容器将在下一步切换。
  mv -f -- "${candidate_env}" "${RELEASE_ENV}"
  candidate_env=''
  chown root:root "${RELEASE_ENV}"
  chmod 600 "${RELEASE_ENV}"

  # 【步骤 11：更新 Web 并等待健康】启动或重建 Web 容器，等待它通过 Nginx 访问 API 的健康检查。
  # 即使镜像版本相同也重新创建，确保载入最新端口环境变量并重新生成 Nginx 配置。
  # 此步骤不连带启动 API，因此 API 需要事先可用。失败时输出最近 100 行 Web 日志，尝试恢复旧版本并报告失败。
  log 'Activating and checking the Web release.'
  if ! compose "${RELEASE_ENV}" up -d --no-deps --force-recreate --wait web; then
    compose "${RELEASE_ENV}" logs --tail=100 web >&2 || true
    restore_previous_web
    fail 'Web container update failed or did not become healthy'
  fi

  # 【收尾：输出结果】显示本次发布的镜像和容器状态，便于人工核对。
  # 这里的成功表示部署与存活/健康检查通过，业务功能仍需另行验收。
  log "Web deployment completed successfully: ${image}"
  compose "${RELEASE_ENV}" ps web
}

# 【程序入口】从这里开始执行 main 中列出的完整流程，使用调用脚本时传入的版本信息。
main "$@"
