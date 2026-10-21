-- Pause Production, Quality, Approval and warehouse writes; switch applications together.
-- Old task starts and closeouts do not record an administrator decision / entry state.
-- Rebuild development data instead of inventing those facts or retaining short-batch history.
CREATE TEMPORARY TABLE guard_task_execution_lifecycle (ok TINYINT NOT NULL CHECK (ok=1));
INSERT INTO guard_task_execution_lifecycle SELECT IF(
  EXISTS (SELECT 1 FROM production_batches)
  OR EXISTS (SELECT 1 FROM http_idempotency_records),0,1);
DROP TEMPORARY TABLE guard_task_execution_lifecycle;

ALTER TABLE outbound_order
  DROP FOREIGN KEY fk_outbound_order_short_batch_authorization,
  DROP INDEX idx_outbound_order_short_batch_authorization,
  DROP COLUMN short_batch_authorization_id;
DROP TABLE production_short_batch_authorization_detail;
DROP TABLE production_short_batch_authorization;

ALTER TABLE production_batches
  DROP CHECK chk_production_batches_material_plan_version,
  DROP COLUMN material_plan_version,
  ADD COLUMN started_by BIGINT UNSIGNED NULL AFTER started_at,
  ADD COLUMN start_reason TEXT NULL AFTER started_by,
  ADD COLUMN start_material_snapshot JSON NULL AFTER start_reason,
  ADD CONSTRAINT fk_production_batch_started_by FOREIGN KEY (started_by) REFERENCES users(id),
  ADD CONSTRAINT chk_production_batch_start_facts CHECK (
    (started_at IS NULL AND started_by IS NULL AND start_reason IS NULL AND start_material_snapshot IS NULL)
    OR (started_at IS NOT NULL AND started_by IS NOT NULL AND start_material_snapshot IS NOT NULL
      AND (start_reason IS NULL OR CHAR_LENGTH(TRIM(start_reason))>0))
  );

ALTER TABLE production_batch_closeout_action
  DROP CHECK chk_closeout_action_kind,
  ADD CONSTRAINT chk_closeout_action_kind CHECK (
    item_kind IN ('task','step','abnormal','rework','supplement','outbound','demand','allocation','material')
  );

DELETE rp FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id
WHERE p.code IN ('production:materials:authorize-short-batch','production:materials:close-remaining-demands');
DELETE FROM permissions
WHERE code IN ('production:materials:authorize-short-batch','production:materials:close-remaining-demands');
