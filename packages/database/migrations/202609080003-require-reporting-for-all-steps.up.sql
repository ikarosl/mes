-- Existing non-reporting batch snapshots cannot be converted into reporting facts.
-- Reset development business data before upgrading if this guard fails.
CREATE TEMPORARY TABLE tmp_all_steps_reporting_guard (
  must_be_zero TINYINT NOT NULL,
  CONSTRAINT chk_all_steps_reporting_ready CHECK (must_be_zero = 0)
) ENGINE=MEMORY;
INSERT INTO tmp_all_steps_reporting_guard (must_be_zero)
SELECT 1 WHERE EXISTS (SELECT 1 FROM batch_step_records WHERE need_record_snapshot = 0);
DROP TEMPORARY TABLE tmp_all_steps_reporting_guard;

ALTER TABLE process_route_steps
  DROP CHECK chk_process_route_steps_flags,
  DROP COLUMN need_record,
  ADD CONSTRAINT chk_process_route_steps_flags CHECK (need_inspection IN (0, 1) AND status IN (0, 1) AND is_deleted IN (0, 1));
ALTER TABLE batch_step_records
  DROP CHECK chk_batch_step_records_flags,
  DROP COLUMN need_record_snapshot,
  ADD CONSTRAINT chk_batch_step_records_flags CHECK (need_inspection_snapshot IN (0, 1));

DELETE rp FROM role_permissions rp
JOIN permissions p ON p.id = rp.permission_id
WHERE p.code = 'production:steps:complete';
DELETE FROM permissions WHERE code = 'production:steps:complete';
