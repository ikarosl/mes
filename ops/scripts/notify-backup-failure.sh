#!/usr/bin/env bash

# SMTP 提醒与业务邮件无关。配置保存在服务器，不能上传包含授权码的实际文件。
set -Eeuo pipefail
export PATH='/usr/sbin:/usr/bin:/sbin:/bin'
umask 077
readonly config='/etc/easy-mes/backup-mail.conf'
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
[[ "${EUID}" == 0 ]] || fail 'run this script as root'
[[ "$#" == 2 && "$1" =~ ^[a-z-]+$ && "$2" =~ ^[0-9]+$ ]] || \
  fail 'usage: notify-backup-failure.sh <operation-name> <numeric-exit-code>'
if [[ ! -e "${config}" ]]; then
  printf 'WARNING: backup email is not configured; see /etc/easy-mes/backup-mail.conf.\n' >&2
  exit 1
fi
[[ -f "${config}" && ! -L "${config}" ]] || fail "configuration must be a regular file, not a symlink: ${config}"
[[ "$(stat -c '%u:%a' "${config}")" == '0:600' ]] || \
  fail "configuration must be owned by root with mode 600: ${config}"
command -v curl >/dev/null || fail 'curl is not installed'
# 只读取发件地址构造邮件头，接受 curl 配置中的缩进和分隔符空格，不执行配置。
from="$(awk '
  /^[[:space:]]*mail-from([[:space:]]|=|:)/ {
    count++
    value=$0
    sub(/^[[:space:]]*mail-from[[:space:]]*[:=]?[[:space:]]*/, "", value)
    sub(/[[:space:]]+$/, "", value)
    if (value ~ /^".*"$/) value=substr(value,2,length(value)-2)
  }
  END { if (count != 1) exit 1; print value }
' "${config}")" || fail 'configuration requires exactly one mail-from entry'
[[ "${from}" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$ ]] || \
  fail 'mail-from must contain a plain email address; check the configuration format'
host="$(hostname | tr -cd 'A-Za-z0-9._-')"
{
  printf 'From: Easy MES <%s>\r\n' "${from}"
  printf 'Subject: [Easy MES] %s failed on %s\r\n' "$1" "${host}"
  printf 'Date: %s\r\n' "$(LC_ALL=C date -R)"
  printf 'MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n'
  printf '操作：%s\r\n退出码：%s\r\n时间：%s\r\n' "$1" "$2" "$(date --iso-8601=seconds)"
  printf '请检查服务器备份/发布日志和维护状态。不要直接重启应用或删除维护文件。\r\n'
  printf '定时任务日志：journalctl -u easy-mes-mysql-backup.service\r\n'
} | curl --disable --config "${config}" --silent --show-error \
  --connect-timeout 10 --max-time 30 --ssl-reqd --upload-file -
printf 'SMTP accepted the message; check the recipient inbox and spam folder.\n'
