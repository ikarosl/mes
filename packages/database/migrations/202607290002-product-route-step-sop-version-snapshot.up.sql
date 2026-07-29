SET @sop_version_column_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'process_route_steps'
    AND column_name = 'sop_version_no_snapshot'
);
SET @add_sop_version_column_sql = IF(
  @sop_version_column_exists = 0,
  'ALTER TABLE process_route_steps ADD COLUMN sop_version_no_snapshot VARCHAR(64) NULL AFTER sop_object_key_snapshot',
  'SELECT 1'
);
PREPARE add_sop_version_column FROM @add_sop_version_column_sql;
EXECUTE add_sop_version_column;
DEALLOCATE PREPARE add_sop_version_column;

UPDATE process_route_steps route_step
JOIN technical_files technical_file ON technical_file.id = route_step.sop_file_id
SET route_step.sop_version_no_snapshot = technical_file.version_no
WHERE route_step.sop_file_id IS NOT NULL;

SET @sop_version_constraint_exists = (
  SELECT COUNT(*)
  FROM information_schema.table_constraints
  WHERE table_schema = DATABASE()
    AND table_name = 'process_route_steps'
    AND constraint_name = 'chk_process_route_steps_sop_version_snapshot'
);
SET @add_sop_version_constraint_sql = IF(
  @sop_version_constraint_exists = 0,
  'ALTER TABLE process_route_steps ADD CONSTRAINT chk_process_route_steps_sop_version_snapshot CHECK ((sop_file_name_snapshot IS NULL AND sop_object_key_snapshot IS NULL AND sop_version_no_snapshot IS NULL) OR (sop_file_name_snapshot IS NOT NULL AND sop_object_key_snapshot IS NOT NULL AND sop_version_no_snapshot IS NOT NULL))',
  'SELECT 1'
);
PREPARE add_sop_version_constraint FROM @add_sop_version_constraint_sql;
EXECUTE add_sop_version_constraint;
DEALLOCATE PREPARE add_sop_version_constraint;
