-- Pause Approval and related business writes while migrating and deploying the new API.
-- A flow stores a business source rule; an instance stores the resolved user.
ALTER TABLE approval_flow_steps
  DROP CHECK chk_approval_flow_steps_assignee,
  ADD COLUMN assignee_source_code VARCHAR(100) NULL AFTER assignee_user_id,
  ADD CONSTRAINT chk_approval_flow_steps_assignee CHECK (
    (assignee_type='role' AND role_id IS NOT NULL AND assignee_user_id IS NULL AND assignee_source_code IS NULL)
    OR (assignee_type='user' AND role_id IS NULL AND assignee_user_id IS NOT NULL AND assignee_source_code IS NULL)
    OR (assignee_type='business' AND role_id IS NULL AND assignee_user_id IS NULL
      AND assignee_source_code IS NOT NULL AND CHAR_LENGTH(TRIM(assignee_source_code))>0)
  );

ALTER TABLE approval_instance_steps
  ADD COLUMN resolved_assignee_user_id BIGINT UNSIGNED NULL AFTER flow_step_id,
  ADD KEY idx_approval_instance_steps_resolved_user (resolved_assignee_user_id,status,instance_id),
  ADD CONSTRAINT fk_approval_instance_steps_resolved_user
    FOREIGN KEY (resolved_assignee_user_id) REFERENCES users(id);

-- The rule lives in another table, so application validation enforces that only
-- business nodes have a resolved user. The resolved identity is immutable.
