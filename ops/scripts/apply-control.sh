#!/usr/bin/env bash

# 【用途】接收自动发布流程（CD）上传的部署控制文件，并应用新的 Compose 配置。
# 控制文件指 compose.prod.yml 和三个发布脚本，不包括 /etc/easy-mes 下的人工配置。
# 【入口】由 CD 调用 /opt/easy-mes/apply-control.sh <40 位 Git 提交 SHA>。
# Git SHA 标识代码提交；上传包必须已放在 /tmp/easy-mes-control-<同一个 SHA>。
# 【顺序】核对参数和文件 → 预检查 → 加锁备份 → 复制控制文件 →
# 已有发布记录时协调服务；协调失败则恢复旧文件并尝试重新启动服务。
# 首次服务器目录须先由 install-easy-mes-compose 准备。
# 完整操作入口：ops/runbooks/compose-server-deployment.md。
#
# 【执行环境】统一脚本运行条件和新建文件的默认保护方式，减少环境差异造成的部署问题。
# 未单独处理的执行错误会中止后续步骤；具体恢复动作见下方失败处理流程。
set -Eeuo pipefail
IFS=$'\n\t'
export PATH='/usr/sbin:/usr/bin:/sbin:/bin'
umask 077

# 【目录与配置】PROJECT_NAME 标识这套服务，STACK_DIR 保存服务器正在使用的控制文件。
# DEPLOY_ENV 提供人工维护的部署配置，RELEASE_ENV 记录当前 API/Web 镜像。
# LOCK_FILE 与 API/Web 发布共用，避免多个任务同时修改运行配置。
readonly PROJECT_NAME='easy-mes'
readonly STACK_DIR='/opt/easy-mes'
readonly DEPLOY_ENV='/etc/easy-mes/deploy.env'
readonly RELEASE_ENV="${STACK_DIR}/release.env"
readonly LOCK_FILE='/run/lock/easy-mes-deploy.lock'

# 【本次更新的临时状态】revision 保存要应用的 Git 提交 SHA。
# bundle_dir 保存 CD 上传包目录；backup_dir 保存替换前控制文件的临时备份目录。
# 初始为空，等主流程确定路径后赋值；退出清理会根据这两个目录变量删除临时文件。
revision=''
bundle_dir=''
backup_dir=''

# 【函数：记录进度】输出带时间的进度提示，方便查看部署进行到了哪一步，以及失败发生在什么时间。
log() {
  printf '[%s] %s\n' "$(date --iso-8601=seconds)" "$*"
}

# 【函数：报错并结束】显示失败原因并停止脚本，让人工操作或自动发布流程知道本次操作失败。
fail() {
  printf '[%s] ERROR: %s\n' "$(date --iso-8601=seconds)" "$*" >&2
  exit 1
}

# 【函数：清理上传包和临时备份】删除本次上传目录及控制文件临时备份，避免临时文件长期积累。
# 成功或失败退出都会尝试清理，因此上传目录只应放本次部署文件，备份也不能作为长期恢复副本。
# 这一步不删除 /etc/easy-mes 中的人工配置或业务数据。
cleanup() {
  if [[ -n "${backup_dir}" && -d "${backup_dir}" ]]; then
    rm -rf --one-file-system -- "${backup_dir}"
  fi
  if [[ -n "${bundle_dir}" && -d "${bundle_dir}" ]]; then
    rm -rf --one-file-system -- "${bundle_dir}"
  fi
}

# 【退出时收尾】正常结束或因错误退出时清理临时文件。
# 清理不负责恢复旧版本；恢复动作由主流程中的失败分支安排。
trap cleanup EXIT

# 【函数：检查上传文件类型】确认上传包中的指定文件实际存在，并且是普通文件。
# 拒绝指向其他位置的符号链接，避免复制到上传包之外的文件；不符合要求时停止更新。
require_regular_bundle_file() {
  local file="$1"
  [[ -f "${file}" && ! -L "${file}" ]] || fail "bundle file must be regular and not a symlink: ${file}"
}

# 【函数：按指定 Compose 文件执行操作】使用指定的新服务定义或正式服务定义，搭配服务器人工配置来执行校验或启动。
# 已有发布记录时继续使用其中的 API/Web 镜像，因此更新部署方式时能沿用现有应用版本。
# 没有发布记录时，镜像取服务定义的默认值；是否启动服务由主流程判断。
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

# 【函数：恢复替换前的四个控制文件】把备份文件复制回运行目录；原来不存在的文件则删除本次新增版本。
# 恢复后仍由 root 管理，并保留脚本可执行的权限。这个函数只恢复文件，服务恢复由主流程继续处理。
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

# 【主流程】检查上传包，备份并替换控制文件，再让已有服务应用新配置。
# 仅在应用新 Compose 配置失败时明确尝试恢复；其他阶段报错不保证自动回到更新前状态。
main() {
  local name mode
  # 【步骤 1：核对用户、提交号和上传目录】要求以 root 身份执行，并提供一个格式正确的 Git 提交号。
  # 根据提交号找到固定上传目录，确认目录存在且不是符号链接；这里不验证目录内容是否来自该提交。
  [[ "${EUID}" -eq 0 ]] || fail 'apply-control.sh must run as root'
  [[ "$#" -eq 1 ]] || fail 'usage: apply-control.sh <40-character Git SHA>'
  revision="$1"
  [[ "${revision}" =~ ^[0-9a-f]{40}$ ]] || fail 'invalid Git revision'
  bundle_dir="/tmp/easy-mes-control-${revision}"
  [[ -d "${bundle_dir}" && ! -L "${bundle_dir}" ]] || fail "control bundle is missing: ${bundle_dir}"

  # 【步骤 2：检查运行工具】确认 Docker、Compose 和发布互斥工具可用；缺少任何一项就停止更新。
  command -v docker >/dev/null 2>&1 || fail 'docker is required'
  command -v flock >/dev/null 2>&1 || fail 'flock is required'
  docker compose version >/dev/null 2>&1 || fail 'Docker Compose plugin is unavailable'

  # 【步骤 3：检查上传包】确认四个控制文件齐全，检查发布脚本及新 Compose 配置，尽量在替换前发现问题。
  # 当前脚本的语法检查仅覆盖 deploy-api.sh，未覆盖另外两个脚本。
  # 本步骤只做检查，不启动服务。
  for name in compose.prod.yml deploy-api.sh deploy-web.sh apply-control.sh; do
    require_regular_bundle_file "${bundle_dir}/${name}"
  done
  bash -n "${bundle_dir}/deploy-api.sh" "${bundle_dir}/deploy-web.sh" \
    "${bundle_dir}/apply-control.sh"
  compose_with "${bundle_dir}/compose.prod.yml" config --quiet

  # 【步骤 4：取得共用发布锁】确认没有其他 API、Web 或控制文件更新任务正在发布。
  # 拿到锁后才备份和替换文件，避免不同任务互相覆盖；有其他发布任务时本次直接结束。
  exec 9>"${LOCK_FILE}"
  flock -n 9 || fail 'another easy-mes deployment is already running'

  # 【步骤 5：备份旧控制文件】把运行目录中已有的四个控制文件复制到本次专用临时目录，供失败恢复使用。
  # 只备份实际存在的控制文件，不包含镜像发布记录、人工配置和业务数据。
  backup_dir="$(mktemp -d "${STACK_DIR}/.control-backup.XXXXXX")"
  for name in compose.prod.yml deploy-api.sh deploy-web.sh apply-control.sh; do
    [[ ! -f "${STACK_DIR}/${name}" ]] || install -m 600 "${STACK_DIR}/${name}" "${backup_dir}/${name}"
  done

  # 【步骤 6：安装新控制文件】把上传包中的四个文件逐个复制到运行目录，设为 root 管理，并允许执行脚本。
  # 这些文件逐个替换，无法保证整组同时完成；复制中途失败时没有统一自动恢复分支。
  for name in compose.prod.yml deploy-api.sh deploy-web.sh apply-control.sh; do
    mode=755
    [[ "${name}" != *.yml ]] || mode=644
    install -o root -g root -m "${mode}" "${bundle_dir}/${name}" "${STACK_DIR}/${name}"
  done

  # 【步骤 7：让服务应用新配置】已有非空发布记录时，按照新服务定义启动或更新整套服务，并等待健康检查。
  # 配置发生变化的服务可能被重新创建；沿用现有镜像记录，不执行数据库迁移或管理员初始化。
  # 没有发布记录时跳过启动，只完成控制文件安装。
  if [[ -s "${RELEASE_ENV}" ]]; then
    log 'Reconciling the running stack with the updated Compose definition.'
    if ! compose_with "${STACK_DIR}/compose.prod.yml" up -d --wait; then
      # 服务未能按新配置正常运行时，先恢复旧控制文件，再尝试按旧配置启动服务。
      # 即使恢复启动失败，仍会报告本次更新失败；临时备份会在退出时清理，业务数据不回滚。
      log 'Control update failed; restoring the previous files.'
      restore_control_files
      compose_with "${STACK_DIR}/compose.prod.yml" up -d --wait || true
      fail 'updated Compose stack did not become healthy'
    fi
  fi

  # 【收尾：记录来源】打印本次控制文件对应的 Git SHA，便于追踪部署文件版本。
  # 若此前没有发布记录，这里成功仅表示控制文件已安装，不表示应用已经启动。
  log "Server control files updated from revision ${revision}."
}

# 【程序入口】从这里开始执行 main 中列出的完整流程，使用调用脚本时传入的版本信息。
main "$@"
