CREATE TABLE work_orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  work_order_no VARCHAR(100) NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  product_code_snapshot VARCHAR(100) NOT NULL,
  product_name_snapshot VARCHAR(200) NOT NULL,
  unit_snapshot VARCHAR(20) NOT NULL,
  planned_quantity DECIMAL(12,4) NOT NULL,
  customer_name VARCHAR(255) NULL,
  quality_level VARCHAR(50) NULL,
  work_order_owner_id BIGINT UNSIGNED NULL,
  plan_start_date DATE NULL,
  plan_end_date DATE NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  released_at DATETIME NULL,
  external_order_no VARCHAR(100) NULL,
  remark TEXT NULL,
  version INT NOT NULL DEFAULT 0,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_work_orders_no (work_order_no),
  UNIQUE KEY uk_work_orders_product_reference (id, product_id),
  KEY idx_work_orders_status_created_at (status, created_at),
  KEY idx_work_orders_owner_status_created_at (work_order_owner_id, status, created_at),
  KEY idx_work_orders_plan_start_date (plan_start_date),
  CONSTRAINT chk_work_orders_quantity CHECK (planned_quantity > 0),
  CONSTRAINT chk_work_orders_plan_dates CHECK (plan_start_date IS NULL OR plan_end_date IS NULL OR plan_end_date >= plan_start_date),
  CONSTRAINT chk_work_orders_status CHECK (status IN ('draft', 'released', 'doing', 'completed', 'cancelled', 'closed')),
  CONSTRAINT chk_work_orders_version CHECK (version >= 0),
  CONSTRAINT fk_work_orders_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT fk_work_orders_owner FOREIGN KEY (work_order_owner_id) REFERENCES users(id),
  CONSTRAINT fk_work_orders_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_work_orders_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE production_batches (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  work_order_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  batch_no VARCHAR(100) NOT NULL,
  route_id BIGINT UNSIGNED NULL,
  route_code_snapshot VARCHAR(64) NULL,
  route_version_snapshot VARCHAR(64) NULL,
  planned_quantity DECIMAL(12,4) NOT NULL,
  completed_quantity DECIMAL(12,4) NOT NULL DEFAULT 0,
  qualified_quantity DECIMAL(12,4) NOT NULL DEFAULT 0,
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  completed_by BIGINT UNSIGNED NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'pending',
  batch_owner_id BIGINT UNSIGNED NULL,
  remark TEXT NULL,
  version INT NOT NULL DEFAULT 0,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_production_batches_no (batch_no),
  UNIQUE KEY uk_production_batches_work_order_reference (id, work_order_id),
  UNIQUE KEY uk_production_batches_product_reference (id, product_id),
  KEY idx_production_batches_work_order_status (work_order_id, status),
  CONSTRAINT chk_production_batches_quantity CHECK (planned_quantity > 0 AND completed_quantity >= 0 AND qualified_quantity >= 0 AND qualified_quantity <= completed_quantity),
  CONSTRAINT chk_production_batches_status CHECK (status IN ('pending', 'material_pending', 'material_assigned', 'material_outbound', 'doing', 'completed', 'cancelled')),
  CONSTRAINT chk_production_batches_completed CHECK (status <> 'completed' OR (completed_at IS NOT NULL AND completed_by IS NOT NULL)),
  CONSTRAINT chk_production_batches_version CHECK (version >= 0),
  CONSTRAINT fk_production_batches_work_order_product FOREIGN KEY (work_order_id, product_id) REFERENCES work_orders(id, product_id),
  CONSTRAINT fk_production_batches_route FOREIGN KEY (route_id) REFERENCES process_routes(id),
  CONSTRAINT fk_production_batches_owner FOREIGN KEY (batch_owner_id) REFERENCES users(id),
  CONSTRAINT fk_production_batches_completed_by FOREIGN KEY (completed_by) REFERENCES users(id),
  CONSTRAINT fk_production_batches_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_production_batches_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE batch_step_records (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  production_batch_id BIGINT UNSIGNED NOT NULL,
  route_step_id BIGINT UNSIGNED NOT NULL,
  step_order_snapshot INT NOT NULL,
  step_code_snapshot VARCHAR(100) NOT NULL,
  step_name_snapshot VARCHAR(100) NOT NULL,
  sop_file_id_snapshot BIGINT UNSIGNED NULL,
  sop_file_name_snapshot VARCHAR(255) NULL,
  sop_object_key_snapshot VARCHAR(500) NULL,
  sop_version_no_snapshot VARCHAR(64) NULL,
  responsible_user_id BIGINT UNSIGNED NULL,
  need_record_snapshot TINYINT NOT NULL DEFAULT 1,
  need_inspection_snapshot TINYINT NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  output_quantity DECIMAL(12,4) NOT NULL DEFAULT 0,
  qualified_quantity DECIMAL(12,4) NOT NULL DEFAULT 0,
  abnormal_quantity DECIMAL(12,4) NOT NULL DEFAULT 0,
  rework_quantity DECIMAL(12,4) NOT NULL DEFAULT 0,
  unit_snapshot VARCHAR(20) NOT NULL,
  remark TEXT NULL,
  version INT NOT NULL DEFAULT 0,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_batch_step_records_route_step (production_batch_id, route_step_id),
  KEY idx_batch_step_records_responsible_status (responsible_user_id, status),
  CONSTRAINT chk_batch_step_records_order CHECK (step_order_snapshot > 0),
  CONSTRAINT chk_batch_step_records_flags CHECK (need_record_snapshot IN (0, 1) AND need_inspection_snapshot IN (0, 1)),
  CONSTRAINT chk_batch_step_records_status CHECK (status IN ('pending', 'assigned', 'doing', 'completed', 'abnormal')),
  CONSTRAINT chk_batch_step_records_quantity CHECK (output_quantity >= 0 AND qualified_quantity >= 0 AND abnormal_quantity >= 0 AND rework_quantity >= 0 AND qualified_quantity + abnormal_quantity <= output_quantity),
  CONSTRAINT chk_batch_step_records_completed CHECK (status <> 'completed' OR (started_at IS NOT NULL AND completed_at IS NOT NULL AND completed_at >= started_at)),
  CONSTRAINT chk_batch_step_records_version CHECK (version >= 0),
  CONSTRAINT fk_batch_step_records_batch FOREIGN KEY (production_batch_id) REFERENCES production_batches(id),
  CONSTRAINT fk_batch_step_records_route_step FOREIGN KEY (route_step_id) REFERENCES process_route_steps(id),
  CONSTRAINT fk_batch_step_records_responsible FOREIGN KEY (responsible_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_batch_step_records_sop FOREIGN KEY (sop_file_id_snapshot) REFERENCES technical_files(id) ON DELETE SET NULL,
  CONSTRAINT fk_batch_step_records_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_batch_step_records_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO permissions (name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('生产管理', 'production:view', 'menu', NULL, NULL, NULL, 200, 1)
ON DUPLICATE KEY UPDATE name=VALUES(name), type=VALUES(type), sort_order=VALUES(sort_order), status=1, deleted_at=NULL;

INSERT INTO permissions (parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
SELECT id, '生产工单', 'production:orders:view', 'page', '/production/orders', 'GET', '/api/production/work-orders', 210, 1 FROM permissions WHERE code='production:view'
UNION ALL SELECT id, '创建生产工单', 'production:orders:create', 'api', NULL, 'POST', '/api/production/work-orders', 211, 1 FROM permissions WHERE code='production:view'
UNION ALL SELECT id, '编辑生产工单', 'production:orders:update', 'api', NULL, 'PATCH', '/api/production/work-orders/:id', 212, 1 FROM permissions WHERE code='production:view'
UNION ALL SELECT id, '变更生产工单状态', 'production:orders:transition', 'api', NULL, 'POST', '/api/production/work-orders/:id/actions/*', 213, 1 FROM permissions WHERE code='production:view'
UNION ALL SELECT id, '生产批次与报工', 'production:tasks:view', 'page', '/production/tasks', 'GET', '/api/production/batches', 220, 1 FROM permissions WHERE code='production:view'
UNION ALL SELECT id, '创建生产批次', 'production:batches:create', 'api', NULL, 'POST', '/api/production/work-orders/:id/batches', 221, 1 FROM permissions WHERE code='production:view'
UNION ALL SELECT id, '编辑生产批次', 'production:batches:update', 'api', NULL, 'PATCH', '/api/production/batches/:id', 222, 1 FROM permissions WHERE code='production:view'
UNION ALL SELECT id, '生产批次动作', 'production:batches:transition', 'api', NULL, 'POST', '/api/production/batches/:id/actions/*', 223, 1 FROM permissions WHERE code='production:view'
UNION ALL SELECT id, '工序报工', 'production:steps:report', 'api', NULL, 'PATCH', '/api/production/batches/:id/step-records/:recordId', 224, 1 FROM permissions WHERE code='production:view'
ON DUPLICATE KEY UPDATE parent_id=VALUES(parent_id), name=VALUES(name), type=VALUES(type), route_path=VALUES(route_path), api_method=VALUES(api_method), api_path=VALUES(api_path), sort_order=VALUES(sort_order), status=1, deleted_at=NULL;
