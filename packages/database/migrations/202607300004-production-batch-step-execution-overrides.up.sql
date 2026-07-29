ALTER TABLE batch_step_records
  ADD COLUMN default_responsible_user_id_snapshot BIGINT UNSIGNED NULL AFTER sop_version_no_snapshot,
  ADD COLUMN actual_sop_file_id BIGINT UNSIGNED NULL AFTER responsible_user_id,
  ADD COLUMN actual_sop_file_name_snapshot VARCHAR(255) NULL AFTER actual_sop_file_id,
  ADD COLUMN actual_sop_object_key_snapshot VARCHAR(500) NULL AFTER actual_sop_file_name_snapshot,
  ADD COLUMN actual_sop_version_no_snapshot VARCHAR(64) NULL AFTER actual_sop_object_key_snapshot,
  ADD KEY idx_batch_step_records_default_responsible (default_responsible_user_id_snapshot),
  ADD KEY idx_batch_step_records_actual_sop (actual_sop_file_id),
  ADD CONSTRAINT fk_batch_step_records_default_responsible
    FOREIGN KEY (default_responsible_user_id_snapshot) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_batch_step_records_actual_sop
    FOREIGN KEY (actual_sop_file_id) REFERENCES technical_files(id) ON DELETE SET NULL;

UPDATE batch_step_records
SET default_responsible_user_id_snapshot = responsible_user_id
WHERE default_responsible_user_id_snapshot IS NULL;

INSERT INTO permissions (name, code, type, route_path, api_method, api_path, sort_order, status)
SELECT id, '维护批次工序执行参数', 'production:steps:manage-execution', 'api', NULL, 'PATCH',
       '/api/production/batches/:batchId/step-records/:recordId/execution', 224, 1
FROM permissions
WHERE code='production:view'
ON DUPLICATE KEY UPDATE parent_id=VALUES(parent_id), name=VALUES(name), type=VALUES(type),
  route_path=VALUES(route_path), api_method=VALUES(api_method), api_path=VALUES(api_path),
  sort_order=VALUES(sort_order), status=1, deleted_at=NULL;
