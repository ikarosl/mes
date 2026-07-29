DELETE FROM permissions WHERE code = 'production:steps:manage-execution';

ALTER TABLE batch_step_records
  DROP FOREIGN KEY fk_batch_step_records_actual_sop,
  DROP FOREIGN KEY fk_batch_step_records_default_responsible,
  DROP INDEX idx_batch_step_records_actual_sop,
  DROP INDEX idx_batch_step_records_default_responsible,
  DROP COLUMN actual_sop_version_no_snapshot,
  DROP COLUMN actual_sop_object_key_snapshot,
  DROP COLUMN actual_sop_file_name_snapshot,
  DROP COLUMN actual_sop_file_id,
  DROP COLUMN default_responsible_user_id_snapshot;
