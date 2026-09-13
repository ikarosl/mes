-- Personal assignment history cannot be reconstructed from shared node decisions.
-- Explicitly reset development data before reverting this schema.
CREATE TEMPORARY TABLE tmp_approval_node_rollback_guard (
  must_be_zero TINYINT NOT NULL,
  CONSTRAINT chk_approval_node_rollback_empty CHECK (must_be_zero=0)
) ENGINE=MEMORY;
INSERT INTO tmp_approval_node_rollback_guard (must_be_zero)
SELECT 1 WHERE EXISTS (SELECT 1 FROM approval_instances)
  OR EXISTS (SELECT 1 FROM approval_flow_steps WHERE assignee_type='user');
DROP TEMPORARY TABLE tmp_approval_node_rollback_guard;

ALTER TABLE approval_flow_steps
  DROP CHECK chk_approval_flow_steps_assignee,
  DROP FOREIGN KEY fk_approval_flow_steps_assignee_user,
  DROP INDEX idx_approval_flow_steps_user,
  DROP COLUMN assignee_user_id,
  DROP COLUMN assignee_type,
  MODIFY COLUMN role_id BIGINT UNSIGNED NOT NULL;

ALTER TABLE approval_instance_steps
  DROP CHECK chk_approval_instance_steps_status,
  DROP CHECK chk_approval_instance_steps_end_fact,
  ADD COLUMN assignment_round INT NOT NULL DEFAULT 0 AFTER status,
  ADD COLUMN blocked_reason VARCHAR(50) NULL AFTER assignment_round,
  MODIFY COLUMN active_slot TINYINT GENERATED ALWAYS AS (
    CASE WHEN status IN ('pending','blocked') THEN 1 ELSE NULL END
  ) STORED,
  ADD CONSTRAINT chk_approval_instance_steps_round CHECK (assignment_round>=0),
  ADD CONSTRAINT chk_approval_instance_steps_status CHECK (
    status IN ('waiting','pending','blocked','approved','rejected','cancelled')
  ),
  ADD CONSTRAINT chk_approval_instance_steps_blocked_reason CHECK (
    (status='blocked' AND blocked_reason IS NOT NULL AND blocked_reason='no_eligible_assignee')
    OR (status<>'blocked' AND blocked_reason IS NULL)
  ),
  ADD CONSTRAINT chk_approval_instance_steps_end_fact CHECK (
    (status IN ('waiting','pending','blocked') AND ended_at IS NULL)
    OR (status IN ('approved','rejected','cancelled') AND ended_at IS NOT NULL)
  );

CREATE TABLE approval_tasks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  instance_step_id BIGINT UNSIGNED NOT NULL,
  assignment_round INT NOT NULL,
  assignee_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  close_reason VARCHAR(50) NULL,
  ended_at DATETIME NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  version INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uk_approval_tasks_assignment (instance_step_id,assignment_round,assignee_id),
  KEY idx_approval_tasks_assignee_status (assignee_id,status,created_at,id),
  CONSTRAINT chk_approval_tasks_round CHECK (assignment_round>0),
  CONSTRAINT chk_approval_tasks_status CHECK (status IN ('pending','approved','rejected','closed')),
  CONSTRAINT chk_approval_tasks_close_reason CHECK (
    (status='closed' AND close_reason IS NOT NULL AND close_reason IN ('peer_decided','instance_rejected','instance_withdrawn','reassigned'))
    OR (status<>'closed' AND close_reason IS NULL)
  ),
  CONSTRAINT chk_approval_tasks_end_fact CHECK (
    (status='pending' AND ended_at IS NULL)
    OR (status IN ('approved','rejected','closed') AND ended_at IS NOT NULL)
  ),
  CONSTRAINT chk_approval_tasks_version CHECK (version>=0),
  CONSTRAINT fk_approval_tasks_instance_step FOREIGN KEY (instance_step_id) REFERENCES approval_instance_steps(id),
  CONSTRAINT fk_approval_tasks_assignee FOREIGN KEY (assignee_id) REFERENCES users(id),
  CONSTRAINT fk_approval_tasks_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_approval_tasks_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE approval_actions
  DROP CHECK chk_approval_actions_decision_step,
  DROP INDEX uk_approval_actions_decision_step,
  DROP COLUMN decision_step_id,
  ADD COLUMN task_id BIGINT UNSIGNED NULL AFTER instance_step_id,
  ADD UNIQUE KEY uk_approval_actions_task (task_id),
  ADD CONSTRAINT fk_approval_actions_task FOREIGN KEY (task_id) REFERENCES approval_tasks(id),
  ADD CONSTRAINT chk_approval_actions_decision_task CHECK (
    (action_type IN ('approved','rejected') AND task_id IS NOT NULL AND instance_step_id IS NOT NULL)
    OR (action_type NOT IN ('approved','rejected') AND task_id IS NULL)
  );

INSERT INTO permissions (parent_id,name,code,type,api_method,api_path,sort_order,status)
SELECT id,'重新分派审批','approval:reassign','api','POST','/api/approval/instances/:id/reassign',53,1
FROM permissions WHERE code='approval:view';
