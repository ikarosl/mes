-- Pause Approval and Product writes while applying this migration and deploying the new API.
-- Preserve actual decisions; candidate task copies are replaced by the existing node execution.
ALTER TABLE approval_flow_steps
  ADD COLUMN assignee_type VARCHAR(20) NOT NULL DEFAULT 'role' AFTER name,
  MODIFY COLUMN role_id BIGINT UNSIGNED NULL,
  ADD COLUMN assignee_user_id BIGINT UNSIGNED NULL AFTER role_id,
  ADD KEY idx_approval_flow_steps_user (assignee_user_id,flow_version_id),
  ADD CONSTRAINT fk_approval_flow_steps_assignee_user FOREIGN KEY (assignee_user_id) REFERENCES users(id),
  ADD CONSTRAINT chk_approval_flow_steps_assignee CHECK (
    (assignee_type='role' AND role_id IS NOT NULL AND assignee_user_id IS NULL)
    OR (assignee_type='user' AND role_id IS NULL AND assignee_user_id IS NOT NULL)
  );
ALTER TABLE approval_flow_steps ALTER COLUMN assignee_type DROP DEFAULT;

ALTER TABLE approval_actions
  DROP FOREIGN KEY fk_approval_actions_task,
  DROP CHECK chk_approval_actions_decision_task,
  DROP INDEX uk_approval_actions_task,
  DROP COLUMN task_id,
  ADD COLUMN decision_step_id BIGINT UNSIGNED GENERATED ALWAYS AS (
    CASE WHEN action_type IN ('approved','rejected') THEN instance_step_id ELSE NULL END
  ) STORED,
  ADD UNIQUE KEY uk_approval_actions_decision_step (decision_step_id),
  ADD CONSTRAINT chk_approval_actions_decision_step CHECK (
    action_type NOT IN ('approved','rejected') OR instance_step_id IS NOT NULL
  );

DROP TABLE approval_tasks;

ALTER TABLE approval_instance_steps
  DROP CHECK chk_approval_instance_steps_round,
  DROP CHECK chk_approval_instance_steps_blocked_reason,
  DROP COLUMN assignment_round,
  DROP COLUMN blocked_reason;
UPDATE approval_instance_steps SET status='pending' WHERE status='blocked';
ALTER TABLE approval_instance_steps
  DROP CHECK chk_approval_instance_steps_status,
  DROP CHECK chk_approval_instance_steps_end_fact,
  MODIFY COLUMN active_slot TINYINT GENERATED ALWAYS AS (
    CASE WHEN status='pending' THEN 1 ELSE NULL END
  ) STORED,
  ADD CONSTRAINT chk_approval_instance_steps_status CHECK (
    status IN ('waiting','pending','approved','rejected','cancelled')
  ),
  ADD CONSTRAINT chk_approval_instance_steps_end_fact CHECK (
    (status IN ('waiting','pending') AND ended_at IS NULL)
    OR (status IN ('approved','rejected','cancelled') AND ended_at IS NOT NULL)
  );

DELETE rp FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id
WHERE p.code='approval:reassign';
DELETE FROM permissions WHERE code='approval:reassign';
