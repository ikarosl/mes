-- Approval BOM pilot.  The development database may be reset, but an existing
-- production-task BOM lock has no corresponding approval evidence.  Refuse to
-- reinterpret such rows as approved products.
CREATE TEMPORARY TABLE tmp_approval_bom_lock_guard (
  must_be_zero TINYINT NOT NULL,
  CONSTRAINT chk_approval_bom_lock_guard CHECK (must_be_zero = 0)
) ENGINE=MEMORY;

INSERT INTO tmp_approval_bom_lock_guard (must_be_zero)
SELECT 1 FROM products WHERE bom_locked_at IS NOT NULL LIMIT 1;

DROP TEMPORARY TABLE tmp_approval_bom_lock_guard;

CREATE TABLE approval_flow_definitions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  scene_code VARCHAR(100) NOT NULL,
  name VARCHAR(100) NOT NULL,
  published_version_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_deleted TINYINT NOT NULL DEFAULT 0,
  deleted_by BIGINT UNSIGNED NULL,
  deleted_at DATETIME NULL,
  version INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uk_approval_flow_definitions_scene (scene_code),
  KEY idx_approval_flow_definitions_published (published_version_id),
  CONSTRAINT chk_approval_flow_definitions_deleted CHECK (
    (is_deleted=0 AND deleted_by IS NULL AND deleted_at IS NULL)
    OR (is_deleted=1 AND deleted_by IS NOT NULL AND deleted_at IS NOT NULL)
  ),
  CONSTRAINT chk_approval_flow_definitions_version CHECK (version >= 0),
  CONSTRAINT fk_approval_flow_definitions_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_approval_flow_definitions_updated_by FOREIGN KEY (updated_by) REFERENCES users(id),
  CONSTRAINT fk_approval_flow_definitions_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE approval_flow_versions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  definition_id BIGINT UNSIGNED NOT NULL,
  version_no INT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  published_by BIGINT UNSIGNED NULL,
  published_at DATETIME NULL,
  draft_slot TINYINT GENERATED ALWAYS AS (
    CASE WHEN status='draft' THEN 1 ELSE NULL END
  ) STORED,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_deleted TINYINT NOT NULL DEFAULT 0,
  deleted_by BIGINT UNSIGNED NULL,
  deleted_at DATETIME NULL,
  version INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uk_approval_flow_versions_number (definition_id,version_no),
  UNIQUE KEY uk_approval_flow_versions_reference (id,definition_id),
  UNIQUE KEY uk_approval_flow_versions_draft (definition_id,draft_slot),
  KEY idx_approval_flow_versions_status (definition_id,status),
  CONSTRAINT chk_approval_flow_versions_number CHECK (version_no > 0),
  CONSTRAINT chk_approval_flow_versions_status CHECK (status IN ('draft','published','discarded')),
  CONSTRAINT chk_approval_flow_versions_published_fact CHECK (
    (status='published' AND published_by IS NOT NULL AND published_at IS NOT NULL)
    OR (status IN ('draft','discarded') AND published_by IS NULL AND published_at IS NULL)
  ),
  CONSTRAINT chk_approval_flow_versions_deleted CHECK (
    (is_deleted=0 AND deleted_by IS NULL AND deleted_at IS NULL)
    OR (is_deleted=1 AND deleted_by IS NOT NULL AND deleted_at IS NOT NULL)
  ),
  CONSTRAINT chk_approval_flow_versions_version CHECK (version >= 0),
  CONSTRAINT fk_approval_flow_versions_definition FOREIGN KEY (definition_id) REFERENCES approval_flow_definitions(id),
  CONSTRAINT fk_approval_flow_versions_published_by FOREIGN KEY (published_by) REFERENCES users(id),
  CONSTRAINT fk_approval_flow_versions_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_approval_flow_versions_updated_by FOREIGN KEY (updated_by) REFERENCES users(id),
  CONSTRAINT fk_approval_flow_versions_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE approval_flow_steps (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  flow_version_id BIGINT UNSIGNED NOT NULL,
  node_code VARCHAR(64) NOT NULL,
  step_no INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  is_deleted TINYINT NOT NULL DEFAULT 0,
  active_step_no INT GENERATED ALWAYS AS (
    CASE WHEN is_deleted=0 THEN step_no ELSE NULL END
  ) STORED,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_by BIGINT UNSIGNED NULL,
  deleted_at DATETIME NULL,
  version INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uk_approval_flow_steps_node (flow_version_id,node_code),
  UNIQUE KEY uk_approval_flow_steps_position (flow_version_id,active_step_no),
  UNIQUE KEY uk_approval_flow_steps_reference (id,flow_version_id),
  CONSTRAINT chk_approval_flow_steps_number CHECK (step_no > 0),
  CONSTRAINT chk_approval_flow_steps_deleted CHECK (
    (is_deleted=0 AND deleted_by IS NULL AND deleted_at IS NULL)
    OR (is_deleted=1 AND deleted_by IS NOT NULL AND deleted_at IS NOT NULL)
  ),
  CONSTRAINT chk_approval_flow_steps_version CHECK (version >= 0),
  CONSTRAINT fk_approval_flow_steps_version FOREIGN KEY (flow_version_id) REFERENCES approval_flow_versions(id),
  CONSTRAINT fk_approval_flow_steps_role FOREIGN KEY (role_id) REFERENCES roles(id),
  CONSTRAINT fk_approval_flow_steps_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_approval_flow_steps_updated_by FOREIGN KEY (updated_by) REFERENCES users(id),
  CONSTRAINT fk_approval_flow_steps_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE approval_instances (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  instance_no VARCHAR(100) NOT NULL,
  scene_code VARCHAR(100) NOT NULL,
  subject_type VARCHAR(50) NOT NULL,
  subject_id BIGINT UNSIGNED NOT NULL,
  flow_version_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(255) NOT NULL,
  subject_version INT NOT NULL,
  snapshot_schema_version INT NOT NULL,
  subject_snapshot JSON NOT NULL,
  policy_snapshot JSON NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  ended_at DATETIME NULL,
  active_slot TINYINT GENERATED ALWAYS AS (
    CASE WHEN status='pending' THEN 1 ELSE NULL END
  ) STORED,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  version INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uk_approval_instances_no (instance_no),
  UNIQUE KEY uk_approval_instances_active_subject (scene_code,subject_type,subject_id,active_slot),
  KEY idx_approval_instances_applicant_status (created_by,status,created_at,id),
  KEY idx_approval_instances_subject (scene_code,subject_type,subject_id,created_at,id),
  CONSTRAINT chk_approval_instances_subject_version CHECK (subject_version >= 0),
  CONSTRAINT chk_approval_instances_snapshot_version CHECK (snapshot_schema_version > 0),
  CONSTRAINT chk_approval_instances_status CHECK (status IN ('pending','approved','rejected','withdrawn')),
  CONSTRAINT chk_approval_instances_ended_fact CHECK (
    (status='pending' AND ended_at IS NULL)
    OR (status IN ('approved','rejected','withdrawn') AND ended_at IS NOT NULL)
  ),
  CONSTRAINT chk_approval_instances_version CHECK (version >= 0),
  CONSTRAINT fk_approval_instances_flow_version FOREIGN KEY (flow_version_id) REFERENCES approval_flow_versions(id),
  CONSTRAINT fk_approval_instances_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_approval_instances_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE approval_instance_steps (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  instance_id BIGINT UNSIGNED NOT NULL,
  flow_step_id BIGINT UNSIGNED NOT NULL,
  step_no INT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'waiting',
  assignment_round INT NOT NULL DEFAULT 0,
  blocked_reason VARCHAR(50) NULL,
  activated_at DATETIME NULL,
  ended_at DATETIME NULL,
  active_slot TINYINT GENERATED ALWAYS AS (
    CASE WHEN status IN ('pending','blocked') THEN 1 ELSE NULL END
  ) STORED,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  version INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uk_approval_instance_steps_number (instance_id,step_no),
  UNIQUE KEY uk_approval_instance_steps_flow (instance_id,flow_step_id),
  UNIQUE KEY uk_approval_instance_steps_reference (id,instance_id),
  UNIQUE KEY uk_approval_instance_steps_active (instance_id,active_slot),
  CONSTRAINT chk_approval_instance_steps_number CHECK (step_no > 0),
  CONSTRAINT chk_approval_instance_steps_round CHECK (assignment_round >= 0),
  CONSTRAINT chk_approval_instance_steps_status CHECK (status IN ('waiting','pending','blocked','approved','rejected','cancelled')),
  CONSTRAINT chk_approval_instance_steps_blocked_reason CHECK (
    (status='blocked' AND blocked_reason IS NOT NULL AND blocked_reason='no_eligible_assignee')
    OR (status<>'blocked' AND blocked_reason IS NULL)
  ),
  CONSTRAINT chk_approval_instance_steps_end_fact CHECK (
    (status IN ('waiting','pending','blocked') AND ended_at IS NULL)
    OR (status IN ('approved','rejected','cancelled') AND ended_at IS NOT NULL)
  ),
  CONSTRAINT chk_approval_instance_steps_version CHECK (version >= 0),
  CONSTRAINT fk_approval_instance_steps_instance FOREIGN KEY (instance_id) REFERENCES approval_instances(id),
  CONSTRAINT fk_approval_instance_steps_flow_step FOREIGN KEY (flow_step_id) REFERENCES approval_flow_steps(id),
  CONSTRAINT fk_approval_instance_steps_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_approval_instance_steps_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

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
  CONSTRAINT chk_approval_tasks_round CHECK (assignment_round > 0),
  CONSTRAINT chk_approval_tasks_status CHECK (status IN ('pending','approved','rejected','closed')),
  CONSTRAINT chk_approval_tasks_close_reason CHECK (
    (status='closed' AND close_reason IS NOT NULL AND close_reason IN ('peer_decided','instance_rejected','instance_withdrawn','reassigned'))
    OR (status<>'closed' AND close_reason IS NULL)
  ),
  CONSTRAINT chk_approval_tasks_end_fact CHECK (
    (status='pending' AND ended_at IS NULL)
    OR (status IN ('approved','rejected','closed') AND ended_at IS NOT NULL)
  ),
  CONSTRAINT chk_approval_tasks_version CHECK (version >= 0),
  CONSTRAINT fk_approval_tasks_instance_step FOREIGN KEY (instance_step_id) REFERENCES approval_instance_steps(id),
  CONSTRAINT fk_approval_tasks_assignee FOREIGN KEY (assignee_id) REFERENCES users(id),
  CONSTRAINT fk_approval_tasks_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_approval_tasks_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE approval_actions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  instance_id BIGINT UNSIGNED NOT NULL,
  action_no INT NOT NULL,
  instance_step_id BIGINT UNSIGNED NULL,
  task_id BIGINT UNSIGNED NULL,
  action_type VARCHAR(30) NOT NULL,
  comment TEXT NULL,
  details JSON NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_approval_actions_sequence (instance_id,action_no),
  UNIQUE KEY uk_approval_actions_task (task_id),
  KEY idx_approval_actions_instance_time (instance_id,created_at,id),
  CONSTRAINT chk_approval_actions_number CHECK (action_no > 0),
  CONSTRAINT chk_approval_actions_type CHECK (action_type IN ('submitted','approved','rejected','withdrawn','assignment_blocked','reassigned')),
  CONSTRAINT chk_approval_actions_decision_task CHECK (
    (action_type IN ('approved','rejected') AND task_id IS NOT NULL AND instance_step_id IS NOT NULL)
    OR (action_type NOT IN ('approved','rejected') AND task_id IS NULL)
  ),
  CONSTRAINT fk_approval_actions_instance FOREIGN KEY (instance_id) REFERENCES approval_instances(id),
  CONSTRAINT fk_approval_actions_instance_step FOREIGN KEY (instance_step_id,instance_id) REFERENCES approval_instance_steps(id,instance_id),
  CONSTRAINT fk_approval_actions_task FOREIGN KEY (task_id) REFERENCES approval_tasks(id),
  CONSTRAINT fk_approval_actions_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE approval_flow_definitions
  ADD CONSTRAINT fk_approval_flow_definitions_published_version
  FOREIGN KEY (published_version_id,id)
  REFERENCES approval_flow_versions(id,definition_id);

ALTER TABLE products
  ADD COLUMN bom_status VARCHAR(30) NOT NULL DEFAULT 'draft' AFTER default_route_id,
  ADD COLUMN bom_approval_instance_id BIGINT UNSIGNED NULL AFTER bom_status,
  ADD COLUMN version INT NOT NULL DEFAULT 0 AFTER bom_approval_instance_id,
  ADD KEY idx_products_bom_approval_instance (bom_approval_instance_id),
  ADD CONSTRAINT chk_products_bom_status CHECK (
    (bom_status='draft' AND bom_approval_instance_id IS NULL AND bom_locked_at IS NULL AND bom_locked_by IS NULL)
    OR (bom_status='pending_approval' AND bom_approval_instance_id IS NOT NULL AND bom_locked_at IS NULL AND bom_locked_by IS NULL)
    OR (bom_status='approved' AND bom_approval_instance_id IS NOT NULL AND bom_locked_at IS NOT NULL AND bom_locked_by IS NOT NULL)
  ),
  ADD CONSTRAINT chk_products_version CHECK (version >= 0),
  ADD CONSTRAINT fk_products_bom_approval_instance FOREIGN KEY (bom_approval_instance_id) REFERENCES approval_instances(id);

INSERT INTO permissions (name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('审批中心', 'approval:view', 'page', '/approval/inbox', 'GET', '/api/approval/instances', 50, 1)
ON DUPLICATE KEY UPDATE name=VALUES(name), type=VALUES(type), route_path=VALUES(route_path), api_method=VALUES(api_method), api_path=VALUES(api_path), sort_order=VALUES(sort_order), status=1, deleted_at=NULL;

INSERT INTO permissions (parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
SELECT id, '配置审批流程', 'approval:configure', 'page', '/approval/flows', 'PUT', '/api/approval/scenes/:sceneCode/flow/draft', 51, 1 FROM permissions WHERE code='approval:view'
UNION ALL SELECT id, '处理审批', 'approval:decide', 'api', NULL, 'POST', '/api/approval/instances/:id/approve', 52, 1 FROM permissions WHERE code='approval:view'
UNION ALL SELECT id, '重新分派审批', 'approval:reassign', 'api', NULL, 'POST', '/api/approval/instances/:id/reassign', 53, 1 FROM permissions WHERE code='approval:view'
ON DUPLICATE KEY UPDATE parent_id=VALUES(parent_id), name=VALUES(name), type=VALUES(type), route_path=VALUES(route_path), api_method=VALUES(api_method), api_path=VALUES(api_path), sort_order=VALUES(sort_order), status=1, deleted_at=NULL;
