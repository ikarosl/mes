#!/usr/bin/env bash

# 独立备份入口：backup-mysql.sh manual|scheduled|release [完整目标 API 镜像]。
# manual / scheduled 成功后恢复原服务；release 成功后保持停写，供继续发布或恢复。
# 实际导出由 mysql-backup-common.sh 的 mes_create_backup 完成，deploy-api.sh 也复用它。
# 不读取 BACKUP_FILE 环境变量；完成目录会打印在 Backup completed: ... 后面。
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
# 第一项选择用途；只有 release 需要第二项目标镜像，用于记录本次发布/恢复意图。
[[ "$#" -ge 1 && "$#" -le 2 ]] || mes_fail 'usage: backup-mysql.sh manual|scheduled|release [target-image@sha256:digest]'
mode="$1"
target="${2:-}"
case "${mode}" in
  manual|scheduled) [[ "$#" == 1 ]] || mes_fail 'manual/scheduled backups do not accept a target image';;
  release) [[ "${target}" =~ ^(docker\.io/)?[a-z0-9]+([._-][a-z0-9]+)*/easy-mes-api@sha256:[0-9a-f]{64}$ ]] || mes_fail 'release backup requires an immutable target API image';;
  *) mes_fail 'invalid backup mode';;
esac
if [[ "${mode}" == scheduled ]]; then
  # timer 只负责触发；脚本自身也检查北京时间，避免错过维护窗口后补跑。
  scheduled_day="$(TZ=Asia/Shanghai date +%d)"
  scheduled_time="$(TZ=Asia/Shanghai date +%H%M)"
  if [[ ! "${scheduled_day}" =~ ^(01|16)$ || "${scheduled_time}" < 0300 || "${scheduled_time}" > 0314 ]]; then
    mes_log 'Scheduled backup skipped: outside the 1st/16th 03:00-03:14 Asia/Shanghai maintenance window.'
    exit 0
  fi
fi
mes_require_runtime
# 独立调用在这里加锁；发布入口自己持锁并直接调用共享函数，避免重复取锁。
mes_take_lock
mes_create_backup "${mode}" "${target}"
