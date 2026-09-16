-- Do not discard business assignment rules or resolved approval evidence.
-- Development data can be reset through the unified initialization workflow.
CREATE TEMPORARY TABLE tmp_approval_business_rollback_guard (
  must_be_zero TINYINT NOT NULL,
  CONSTRAINT chk_approval_business_rollback_empty CHECK (must_be_zero=0)
) ENGINE=MEMORY;
INSERT INTO tmp_approval_business_rollback_guard (must_be_zero)
SELECT 1 WHERE EXISTS (SELECT 1 FROM approval_flow_steps WHERE assignee_type='business')
  OR EXISTS (SELECT 1 FROM approval_instance_steps WHERE resolved_assignee_user_id IS NOT NULL);
DROP TEMPORARY TABLE tmp_approval_business_rollback_guard;

ALTER TABLE approval_instance_steps
  DROP FOREIGN KEY fk_approval_instance_steps_resolved_user,
  DROP INDEX idx_approval_instance_steps_resolved_user,
  DROP COLUMN resolved_assignee_user_id;

ALTER TABLE approval_flow_steps
  DROP CHECK chk_approval_flow_steps_assignee,
  DROP COLUMN assignee_source_code,
  ADD CONSTRAINT chk_approval_flow_steps_assignee CHECK (
    (assignee_type='role' AND role_id IS NOT NULL AND assignee_user_id IS NULL)
    OR (assignee_type='user' AND role_id IS NULL AND assignee_user_id IS NOT NULL)
  );
