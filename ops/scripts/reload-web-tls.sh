#!/usr/bin/env bash
# Certbot deploy hook：只在 easy-mes 证书续期成功后校验并重载正在运行的 Web。
set -Eeuo pipefail
export PATH='/usr/sbin:/usr/bin:/sbin:/bin'

[[ "${EUID}" -eq 0 ]] || { echo 'run as root' >&2; exit 1; }
[[ "${RENEWED_LINEAGE:-}" == /etc/letsencrypt/live/easy-mes ]] || exit 0

# 与部署共享锁，避免同时替换容器；等待结束后若仍被占用则报告失败。
exec 9>/run/lock/easy-mes-deploy.lock
flock -w 120 9

compose=(docker compose --project-name easy-mes
  --env-file /etc/easy-mes/deploy.env
  --env-file /opt/easy-mes/release.env
  --file /opt/easy-mes/compose.prod.yml)

"${compose[@]}" exec -T web sh -eu -c '
  nginx -t
  nginx -s reload
'
