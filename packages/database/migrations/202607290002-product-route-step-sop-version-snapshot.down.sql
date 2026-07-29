SET @sop_version_constraint_exists = (
  SELECT COUNT(*)
  FROM information_schema.table_constraints
  WHERE table_schema = DATABASE()
    AND table_name = 'process_route_steps'
    AND constraint_name = 'chk_process_route_steps_sop_version_snapshot'
);
SET @drop_sop_version_constraint_sql = IF(
  @sop_version_constraint_exists = 1,
  'ALTER TABLE process_route_steps DROP CHECK chk_process_route_steps_sop_version_snapshot',
  'SELECT 1'
);
PREPARE drop_sop_version_constraint FROM @drop_sop_version_constraint_sql;
EXECUTE drop_sop_version_constraint;
DEALLOCATE PREPARE drop_sop_version_constraint;

SET @sop_version_column_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'process_route_steps'
    AND column_name = 'sop_version_no_snapshot'
);
SET @drop_sop_version_column_sql = IF(
  @sop_version_column_exists = 1,
  'ALTER TABLE process_route_steps DROP COLUMN sop_version_no_snapshot',
  'SELECT 1'
);
PREPARE drop_sop_version_column FROM @drop_sop_version_column_sql;
EXECUTE drop_sop_version_column;
DEALLOCATE PREPARE drop_sop_version_column;
