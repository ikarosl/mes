CREATE TABLE inbound_order (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  inbound_no VARCHAR(100) NOT NULL,
  source_type VARCHAR(30) NOT NULL DEFAULT 'purchased',
  provider VARCHAR(100) NULL,
  work_order_id BIGINT UNSIGNED NULL,
  production_batch_id BIGINT UNSIGNED NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  inbound_at DATETIME NULL,
  operator_id BIGINT UNSIGNED NULL,
  version INT NOT NULL DEFAULT 0,
  remark TEXT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_inbound_order_no (inbound_no),
  UNIQUE KEY uk_inbound_order_id_source (id, source_type),
  KEY idx_inbound_order_status_created (status, created_at),
  CONSTRAINT chk_inbound_order_source_type CHECK (source_type IN ('self_made','purchased','outsourced','return_inbound','stock_check_generated','other')),
  CONSTRAINT chk_inbound_order_status CHECK (status IN ('pending','completed','cancelled')),
  CONSTRAINT chk_inbound_order_version CHECK (version >= 0),
  CONSTRAINT fk_inbound_order_work_order FOREIGN KEY (work_order_id) REFERENCES work_orders(id),
  CONSTRAINT fk_inbound_order_batch_work_order FOREIGN KEY (production_batch_id, work_order_id) REFERENCES production_batches(id, work_order_id),
  CONSTRAINT fk_inbound_order_operator FOREIGN KEY (operator_id) REFERENCES users(id),
  CONSTRAINT fk_inbound_order_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_inbound_order_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inbound_detail (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  inbound_id BIGINT UNSIGNED NOT NULL,
  item_id BIGINT UNSIGNED NOT NULL,
  batch_id BIGINT UNSIGNED NOT NULL,
  item_code_snapshot VARCHAR(100) NOT NULL,
  product_name_snapshot VARCHAR(200) NOT NULL,
  inbound_number DECIMAL(12,4) NOT NULL,
  unit_snapshot VARCHAR(20) NOT NULL,
  stock_status VARCHAR(20) NOT NULL DEFAULT 'available',
  source_stage VARCHAR(100) NULL,
  remark TEXT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_inbound_detail_order_batch_item (inbound_id, batch_id, item_id),
  KEY idx_inbound_detail_item_batch (item_id, batch_id),
  CONSTRAINT chk_inbound_detail_quantity CHECK (inbound_number > 0),
  CONSTRAINT chk_inbound_detail_stock_status CHECK (stock_status IN ('available','pending_inspection','frozen','defective')),
  CONSTRAINT fk_inbound_detail_order FOREIGN KEY (inbound_id) REFERENCES inbound_order(id),
  CONSTRAINT fk_inbound_detail_item FOREIGN KEY (item_id) REFERENCES products(id),
  CONSTRAINT fk_inbound_detail_batch_item FOREIGN KEY (batch_id, item_id) REFERENCES item_batch(id, item_id),
  CONSTRAINT fk_inbound_detail_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO permissions (parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
SELECT id, '查看物料库存', 'production:inventory:view', 'api', NULL, 'GET', '/api/production/inventory-batches*', 231, 1 FROM permissions WHERE code='production:view'
UNION ALL SELECT id, '查看外购物料入库', 'production:inbounds:view', 'api', NULL, 'GET', '/api/production/purchase-inbounds*', 232, 1 FROM permissions WHERE code='production:view'
UNION ALL SELECT id, '创建外购物料入库', 'production:inbounds:create', 'api', NULL, 'POST', '/api/production/purchase-inbounds', 233, 1 FROM permissions WHERE code='production:view'
UNION ALL SELECT id, '确认外购物料入库', 'production:inbounds:confirm', 'api', NULL, 'POST', '/api/production/purchase-inbounds/:inboundId/actions/confirm', 234, 1 FROM permissions WHERE code='production:view'
UNION ALL SELECT id, '取消待确认入库单', 'production:inbounds:cancel', 'api', NULL, 'POST', '/api/production/purchase-inbounds/:inboundId/actions/cancel', 235, 1 FROM permissions WHERE code='production:view'
ON DUPLICATE KEY UPDATE parent_id=VALUES(parent_id), name=VALUES(name), type=VALUES(type), route_path=VALUES(route_path), api_method=VALUES(api_method), api_path=VALUES(api_path), sort_order=VALUES(sort_order), status=1, deleted_at=NULL;
