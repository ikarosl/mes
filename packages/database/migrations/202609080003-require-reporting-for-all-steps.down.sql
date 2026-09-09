-- Removed route flags cannot be reconstructed; rollback requires empty affected tables.
CREATE TEMPORARY TABLE tmp_all_steps_reporting_rollback_guard (
  must_be_zero TINYINT NOT NULL,
  CONSTRAINT chk_all_steps_reporting_rollback_empty CHECK (must_be_zero = 0)
) ENGINE=MEMORY;
INSERT INTO tmp_all_steps_reporting_rollback_guard (must_be_zero)
SELECT 1 WHERE EXISTS (SELECT 1 FROM process_route_steps)
  OR EXISTS (SELECT 1 FROM batch_step_records);
DROP TEMPORARY TABLE tmp_all_steps_reporting_rollback_guard;

ALTER TABLE process_route_steps
  DROP CHECK chk_process_route_steps_flags,
  ADD COLUMN need_record TINYINT NOT NULL DEFAULT 1 AFTER need_inspection,
  ADD CONSTRAINT chk_process_route_steps_flags CHECK (need_inspection IN (0, 1) AND need_record IN (0, 1) AND status IN (0, 1) AND is_deleted IN (0, 1));
ALTER TABLE batch_step_records
  DROP CHECK chk_batch_step_records_flags,
  ADD COLUMN need_record_snapshot TINYINT NOT NULL DEFAULT 1 AFTER actual_sop_version_no_snapshot,
  ADD CONSTRAINT chk_batch_step_records_flags CHECK (need_record_snapshot IN (0, 1) AND need_inspection_snapshot IN (0, 1));

INSERT INTO permissions (parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
SELECT id, '员工完成无需报工工序', 'production:steps:complete', 'api', NULL, 'POST', '/api/production/batches/:batchId/step-records/:recordId/actions/complete', 231, 1
FROM permissions WHERE code = 'production:view';
