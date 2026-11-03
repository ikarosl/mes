#!/usr/bin/env bash

# 由 mysql-backup-common.sh 加载；调用者已持有部署锁并停写。
mes_export_minio() {
  local directory="$1"
  mes_require_file "${MES_STACK_DIR}/minio-backup.mjs"
  mes_log 'Exporting the configured S3 bucket with the API image client.'
  MES_MINIO_CONTAINER="easy-mes-backup-$$-${RANDOM}"
  mes_compose run --rm --name "${MES_MINIO_CONTAINER}" --no-deps -T --user 0:0 --entrypoint node \
    --volume "${MES_STACK_DIR}/minio-backup.mjs:/opt/minio-backup.mjs:ro" \
    --volume "${directory}:/backup" \
    api /opt/minio-backup.mjs backup
  MES_MINIO_CONTAINER=''
  # 归档用户对象，而非复制正在运行的 MinIO 内部存储目录。
  local remaining=$(( MES_BACKUP_DEADLINE_EPOCH - $(date +%s) ))
  (( remaining > 0 )) || mes_fail 'backup deadline exceeded'
  timeout --foreground --kill-after=10s "${remaining}s" tar -C "${directory}" -czf "${directory}/minio.tar.gz" minio
  gzip -t "${directory}/minio.tar.gz"
  rm -rf --one-file-system -- "${directory}/minio"
}

mes_prune_backups() {
  local mode="$1" directory name kept=0
  [[ "${mode}" == scheduled || "${mode}" == release ]] || return 0
  # 只清理本脚本产生的新版完整恢复点；旧 SQL 备份和手动备份不自动删除。
  while IFS= read -r name; do
    [[ "${name}" =~ ^[0-9]{8}T[0-9]{6}Z-${mode}-[A-Za-z0-9]+$ ]] || continue
    directory="${MES_BACKUP_DIR}/${name}"
    [[ -d "${directory}" && ! -L "${directory}" ]] || continue
    [[ -f "${directory}/metadata.env" && ! -L "${directory}/metadata.env" ]] || continue
    [[ "$(stat -c '%u' "${directory}")" == 0 ]] || continue
    [[ "$(awk -F= '$1=="format_version" {print $2}' "${directory}/metadata.env")" == 2 ]] || continue
    [[ "$(awk -F= '$1=="mode" {print $2}' "${directory}/metadata.env")" == "${mode}" ]] || continue
    [[ -f "${directory}/minio.tar.gz" && -f "${directory}/SHA256SUMS" ]] || continue
    kept=$((kept + 1))
    if (( kept > 3 )); then
      mes_log "Removing expired ${mode} backup: ${name}"
      rm -rf --one-file-system -- "${directory}"
    fi
  done < <(find "${MES_BACKUP_DIR}" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | LC_ALL=C sort -r)
}

mes_notify_failure() {
  local operation="$1" status="$2"
  # 提醒为 best-effort；失败不会覆盖原备份/发布的退出码，也不会包含凭证或业务数据。
  if [[ -f "${MES_STACK_DIR}/notify-backup-failure.sh" ]]; then
    (mes_require_file "${MES_STACK_DIR}/notify-backup-failure.sh"
      "${MES_STACK_DIR}/notify-backup-failure.sh" "${operation}" "${status}") || \
      mes_log 'WARNING: failure email was not delivered; review the local backup/deployment log.' >&2
  fi
}
