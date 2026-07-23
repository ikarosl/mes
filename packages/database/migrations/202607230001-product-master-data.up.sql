CREATE TABLE technical_files (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  file_name VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  storage_provider VARCHAR(32) NOT NULL,
  bucket VARCHAR(128) NULL,
  object_key VARCHAR(500) NOT NULL,
  mime_type VARCHAR(128) NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL,
  checksum_sha256 CHAR(64) NOT NULL,
  file_type VARCHAR(64) NOT NULL,
  version_no VARCHAR(64) NOT NULL,
  status TINYINT NOT NULL DEFAULT 1,
  remark VARCHAR(255) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_deleted TINYINT NOT NULL DEFAULT 0,
  deleted_by BIGINT UNSIGNED NULL,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_technical_files_object (storage_provider, bucket, object_key),
  CONSTRAINT chk_technical_files_size CHECK (size_bytes >= 0),
  CONSTRAINT chk_technical_files_status CHECK (status IN (0, 1)),
  CONSTRAINT chk_technical_files_deleted CHECK (is_deleted IN (0, 1)),
  CONSTRAINT fk_technical_files_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_technical_files_updated_by FOREIGN KEY (updated_by) REFERENCES users(id),
  CONSTRAINT fk_technical_files_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE product_categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  parent_id BIGINT UNSIGNED NULL,
  category_code VARCHAR(64) NOT NULL,
  category_name VARCHAR(100) NOT NULL,
  item_kind VARCHAR(30) NOT NULL,
  status TINYINT NOT NULL DEFAULT 1,
  remark TEXT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_deleted TINYINT NOT NULL DEFAULT 0,
  deleted_by BIGINT UNSIGNED NULL,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_product_categories_code (category_code),
  KEY idx_product_categories_parent (parent_id),
  CONSTRAINT chk_product_categories_kind CHECK (item_kind IN ('material', 'semi_finished', 'finished_product')),
  CONSTRAINT chk_product_categories_status CHECK (status IN (0, 1)),
  CONSTRAINT chk_product_categories_deleted CHECK (is_deleted IN (0, 1)),
  CONSTRAINT fk_product_categories_parent FOREIGN KEY (parent_id) REFERENCES product_categories(id),
  CONSTRAINT fk_product_categories_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_product_categories_updated_by FOREIGN KEY (updated_by) REFERENCES users(id),
  CONSTRAINT fk_product_categories_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE products (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  item_code VARCHAR(100) NOT NULL,
  product_name VARCHAR(200) NOT NULL,
  category_id BIGINT UNSIGNED NOT NULL,
  default_route_id BIGINT UNSIGNED NULL,
  unit VARCHAR(20) NOT NULL,
  acquire_method VARCHAR(32) NOT NULL,
  spec_values JSON NULL,
  status TINYINT NOT NULL DEFAULT 1,
  remark TEXT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_deleted TINYINT NOT NULL DEFAULT 0,
  deleted_by BIGINT UNSIGNED NULL,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_products_item_code (item_code),
  KEY idx_products_category (category_id),
  KEY idx_products_default_route (default_route_id),
  CONSTRAINT chk_products_acquire CHECK (acquire_method IN ('self_made', 'outsourced', 'purchased')),
  CONSTRAINT chk_products_status CHECK (status IN (0, 1)),
  CONSTRAINT chk_products_deleted CHECK (is_deleted IN (0, 1)),
  CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES product_categories(id),
  CONSTRAINT fk_products_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_products_updated_by FOREIGN KEY (updated_by) REFERENCES users(id),
  CONSTRAINT fk_products_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE process_steps (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  step_code VARCHAR(100) NOT NULL,
  step_name VARCHAR(100) NOT NULL,
  description VARCHAR(255) NULL,
  default_sop_file_id BIGINT UNSIGNED NULL,
  status TINYINT NOT NULL DEFAULT 1,
  remark TEXT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_deleted TINYINT NOT NULL DEFAULT 0,
  deleted_by BIGINT UNSIGNED NULL,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_process_steps_code (step_code),
  CONSTRAINT chk_process_steps_status CHECK (status IN (0, 1)),
  CONSTRAINT chk_process_steps_deleted CHECK (is_deleted IN (0, 1)),
  CONSTRAINT fk_process_steps_sop FOREIGN KEY (default_sop_file_id) REFERENCES technical_files(id) ON DELETE SET NULL,
  CONSTRAINT fk_process_steps_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_process_steps_updated_by FOREIGN KEY (updated_by) REFERENCES users(id),
  CONSTRAINT fk_process_steps_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE process_routes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  route_code VARCHAR(64) NOT NULL,
  route_name VARCHAR(128) NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  version_no VARCHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  remark VARCHAR(255) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_deleted TINYINT NOT NULL DEFAULT 0,
  deleted_by BIGINT UNSIGNED NULL,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_process_routes_version (product_id, route_code, version_no),
  CONSTRAINT chk_process_routes_status CHECK (status IN ('draft', 'enabled', 'disabled', 'archived')),
  CONSTRAINT chk_process_routes_deleted CHECK (is_deleted IN (0, 1)),
  CONSTRAINT fk_process_routes_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT fk_process_routes_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_process_routes_updated_by FOREIGN KEY (updated_by) REFERENCES users(id),
  CONSTRAINT fk_process_routes_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE products
  ADD CONSTRAINT fk_products_default_route FOREIGN KEY (default_route_id) REFERENCES process_routes(id) ON DELETE SET NULL;

CREATE TABLE product_materials (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id BIGINT UNSIGNED NOT NULL,
  material_product_id BIGINT UNSIGNED NOT NULL,
  quantity_per_unit DECIMAL(12,4) NOT NULL,
  unit VARCHAR(20) NOT NULL,
  is_key_material TINYINT NOT NULL DEFAULT 1,
  need_batch_record TINYINT NOT NULL DEFAULT 1,
  status TINYINT NOT NULL DEFAULT 1,
  remark TEXT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_deleted TINYINT NOT NULL DEFAULT 0,
  deleted_by BIGINT UNSIGNED NULL,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_product_materials_item (product_id, material_product_id),
  UNIQUE KEY uk_product_materials_reference (id, material_product_id),
  CONSTRAINT chk_product_materials_self CHECK (product_id <> material_product_id),
  CONSTRAINT chk_product_materials_quantity CHECK (quantity_per_unit > 0),
  CONSTRAINT chk_product_materials_flags CHECK (is_key_material IN (0, 1) AND need_batch_record IN (0, 1) AND status IN (0, 1) AND is_deleted IN (0, 1)),
  CONSTRAINT fk_product_materials_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT fk_product_materials_material FOREIGN KEY (material_product_id) REFERENCES products(id),
  CONSTRAINT fk_product_materials_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_product_materials_updated_by FOREIGN KEY (updated_by) REFERENCES users(id),
  CONSTRAINT fk_product_materials_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE process_route_steps (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  route_id BIGINT UNSIGNED NOT NULL,
  process_step_id BIGINT UNSIGNED NOT NULL,
  step_order INT NOT NULL,
  step_code_snapshot VARCHAR(100) NOT NULL,
  step_name_snapshot VARCHAR(100) NOT NULL,
  description_snapshot VARCHAR(255) NULL,
  default_owner_id BIGINT UNSIGNED NULL,
  sop_file_id BIGINT UNSIGNED NULL,
  sop_file_name_snapshot VARCHAR(255) NULL,
  sop_object_key_snapshot VARCHAR(500) NULL,
  need_inspection TINYINT NOT NULL DEFAULT 0,
  need_record TINYINT NOT NULL DEFAULT 1,
  status TINYINT NOT NULL DEFAULT 1,
  remark VARCHAR(255) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_deleted TINYINT NOT NULL DEFAULT 0,
  deleted_by BIGINT UNSIGNED NULL,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_process_route_steps_order (route_id, step_order),
  UNIQUE KEY uk_process_route_steps_reference (id, route_id),
  CONSTRAINT chk_process_route_steps_order CHECK (step_order > 0),
  CONSTRAINT chk_process_route_steps_flags CHECK (need_inspection IN (0, 1) AND need_record IN (0, 1) AND status IN (0, 1) AND is_deleted IN (0, 1)),
  CONSTRAINT fk_process_route_steps_route FOREIGN KEY (route_id) REFERENCES process_routes(id),
  CONSTRAINT fk_process_route_steps_step FOREIGN KEY (process_step_id) REFERENCES process_steps(id),
  CONSTRAINT fk_process_route_steps_owner FOREIGN KEY (default_owner_id) REFERENCES users(id),
  CONSTRAINT fk_process_route_steps_sop FOREIGN KEY (sop_file_id) REFERENCES technical_files(id) ON DELETE SET NULL,
  CONSTRAINT fk_process_route_steps_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_process_route_steps_updated_by FOREIGN KEY (updated_by) REFERENCES users(id),
  CONSTRAINT fk_process_route_steps_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE route_step_materials (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  route_step_id BIGINT UNSIGNED NOT NULL,
  product_material_id BIGINT UNSIGNED NOT NULL,
  remark TEXT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_route_step_materials (route_step_id, product_material_id),
  CONSTRAINT fk_route_step_materials_step FOREIGN KEY (route_step_id) REFERENCES process_route_steps(id) ON DELETE RESTRICT,
  CONSTRAINT fk_route_step_materials_material FOREIGN KEY (product_material_id) REFERENCES product_materials(id) ON DELETE RESTRICT,
  CONSTRAINT fk_route_step_materials_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO permissions (name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('产品资料', 'product:view', 'menu', NULL, NULL, NULL, 100, 1)
ON DUPLICATE KEY UPDATE name=VALUES(name), type=VALUES(type), sort_order=VALUES(sort_order), status=1, deleted_at=NULL;

INSERT INTO permissions (parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
SELECT id, '产品管理', 'product:products:view', 'page', '/product/products', 'GET', '/api/product/products', 110, 1 FROM permissions WHERE code='product:view'
UNION ALL SELECT id, '新增产品', 'product:products:create', 'api', NULL, 'POST', '/api/product/products', 111, 1 FROM permissions WHERE code='product:view'
UNION ALL SELECT id, '编辑产品', 'product:products:update', 'api', NULL, 'PATCH', '/api/product/products/:id', 112, 1 FROM permissions WHERE code='product:view'
UNION ALL SELECT id, '变更产品状态', 'product:products:change-status', 'api', NULL, 'PATCH', '/api/product/products/:id/status', 113, 1 FROM permissions WHERE code='product:view'
UNION ALL SELECT id, '维护产品BOM', 'product:products:manage-bom', 'api', NULL, 'PUT', '/api/product/products/:id/materials', 114, 1 FROM permissions WHERE code='product:view'
UNION ALL SELECT id, '设置默认路线', 'product:products:set-default-route', 'api', NULL, 'PATCH', '/api/product/products/:id/default-route', 115, 1 FROM permissions WHERE code='product:view'
UNION ALL SELECT id, '产品分类', 'product:categories:view', 'page', '/product/categories', 'GET', '/api/product/categories', 120, 1 FROM permissions WHERE code='product:view'
UNION ALL SELECT id, '新增分类', 'product:categories:create', 'api', NULL, 'POST', '/api/product/categories', 121, 1 FROM permissions WHERE code='product:view'
UNION ALL SELECT id, '编辑分类', 'product:categories:update', 'api', NULL, 'PATCH', '/api/product/categories/:id', 122, 1 FROM permissions WHERE code='product:view'
UNION ALL SELECT id, '变更分类状态', 'product:categories:change-status', 'api', NULL, 'PATCH', '/api/product/categories/:id/status', 123, 1 FROM permissions WHERE code='product:view'
UNION ALL SELECT id, '工序管理', 'product:processes:view', 'page', '/product/processes', 'GET', '/api/product/process-steps', 130, 1 FROM permissions WHERE code='product:view'
UNION ALL SELECT id, '新增工序', 'product:processes:create', 'api', NULL, 'POST', '/api/product/process-steps', 131, 1 FROM permissions WHERE code='product:view'
UNION ALL SELECT id, '编辑工序', 'product:processes:update', 'api', NULL, 'PATCH', '/api/product/process-steps/:id', 132, 1 FROM permissions WHERE code='product:view'
UNION ALL SELECT id, '变更工序状态', 'product:processes:change-status', 'api', NULL, 'PATCH', '/api/product/process-steps/:id/status', 133, 1 FROM permissions WHERE code='product:view'
UNION ALL SELECT id, '上传工序SOP', 'product:processes:upload-sop', 'api', NULL, 'POST', '/api/product/process-steps/:id/sop', 134, 1 FROM permissions WHERE code='product:view'
UNION ALL SELECT id, '工艺路线', 'product:routes:view', 'page', '/product/process-routes', 'GET', '/api/product/process-routes', 140, 1 FROM permissions WHERE code='product:view'
UNION ALL SELECT id, '新增路线', 'product:routes:create', 'api', NULL, 'POST', '/api/product/process-routes', 141, 1 FROM permissions WHERE code='product:view'
UNION ALL SELECT id, '编辑路线', 'product:routes:update', 'api', NULL, 'PATCH', '/api/product/process-routes/:id', 142, 1 FROM permissions WHERE code='product:view'
UNION ALL SELECT id, '变更路线状态', 'product:routes:change-status', 'api', NULL, 'PATCH', '/api/product/process-routes/:id/status', 143, 1 FROM permissions WHERE code='product:view'
UNION ALL SELECT id, '维护路线步骤', 'product:routes:manage-steps', 'api', NULL, 'PUT', '/api/product/process-routes/:id/steps', 144, 1 FROM permissions WHERE code='product:view'
UNION ALL SELECT id, '删除草稿路线', 'product:routes:delete', 'api', NULL, 'DELETE', '/api/product/process-routes/:id', 145, 1 FROM permissions WHERE code='product:view'
ON DUPLICATE KEY UPDATE parent_id=VALUES(parent_id), name=VALUES(name), type=VALUES(type), route_path=VALUES(route_path), api_method=VALUES(api_method), api_path=VALUES(api_path), sort_order=VALUES(sort_order), status=1, deleted_at=NULL;
