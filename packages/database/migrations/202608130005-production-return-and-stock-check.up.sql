CREATE TABLE return_order (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  return_no VARCHAR(100) NOT NULL,
  production_batch_id BIGINT UNSIGNED NOT NULL,
  work_order_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  return_at DATETIME NULL,
  operator_id BIGINT UNSIGNED NULL,
  version INT NOT NULL DEFAULT 0,
  remark TEXT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_return_order_no (return_no),
  UNIQUE KEY uk_return_order_id_batch (id, production_batch_id),
  KEY idx_return_order_status_created (status, created_at),
  KEY idx_return_order_batch_created (production_batch_id, created_at),
  CONSTRAINT chk_return_order_status CHECK (status IN ('pending','returned','scrapped','cancelled')),
  CONSTRAINT chk_return_order_version CHECK (version >= 0),
  CONSTRAINT chk_return_order_state CHECK (
    (status = 'pending' AND return_at IS NULL AND operator_id IS NULL)
    OR (status = 'returned' AND return_at IS NOT NULL AND operator_id IS NOT NULL)
    OR (status IN ('scrapped','cancelled') AND return_at IS NULL)
  ),
  CONSTRAINT fk_return_order_batch_work_order FOREIGN KEY (production_batch_id, work_order_id)
    REFERENCES production_batches(id, work_order_id),
  CONSTRAINT fk_return_order_operator FOREIGN KEY (operator_id) REFERENCES users(id),
  CONSTRAINT fk_return_order_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_return_order_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE return_detail (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  return_id BIGINT UNSIGNED NOT NULL,
  production_batch_id BIGINT UNSIGNED NOT NULL,
  demand_id BIGINT UNSIGNED NOT NULL,
  allocation_id BIGINT UNSIGNED NOT NULL,
  item_id BIGINT UNSIGNED NOT NULL,
  batch_id BIGINT UNSIGNED NOT NULL,
  return_number DECIMAL(12,4) NOT NULL,
  unit_snapshot VARCHAR(20) NOT NULL,
  return_stock_status VARCHAR(20) NOT NULL DEFAULT 'available',
  release_after_return TINYINT NOT NULL DEFAULT 1,
  remark TEXT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_return_detail_order_allocation (return_id, allocation_id),
  UNIQUE KEY uk_return_detail_source (id, allocation_id, demand_id, production_batch_id, item_id, batch_id),
  KEY idx_return_detail_allocation (allocation_id, created_at),
  KEY idx_return_detail_stock_batch (batch_id, created_at),
  CONSTRAINT chk_return_detail_quantity CHECK (return_number > 0),
  CONSTRAINT chk_return_detail_current_scope CHECK (
    return_stock_status = 'available' AND release_after_return = 1
  ),
  CONSTRAINT fk_return_detail_order_batch FOREIGN KEY (return_id, production_batch_id)
    REFERENCES return_order(id, production_batch_id),
  CONSTRAINT fk_return_detail_demand_batch FOREIGN KEY (demand_id, production_batch_id)
    REFERENCES production_item_demand(id, production_batch_id),
  CONSTRAINT fk_return_detail_allocation FOREIGN KEY (
    allocation_id,
    demand_id,
    production_batch_id,
    item_id,
    batch_id
  ) REFERENCES production_item_allocation(id, demand_id, production_batch_id, item_id, batch_id),
  CONSTRAINT fk_return_detail_stock_batch FOREIGN KEY (batch_id, item_id)
    REFERENCES item_batch(id, item_id),
  CONSTRAINT fk_return_detail_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE stock_check_order (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  check_no VARCHAR(100) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  check_at DATETIME NULL,
  operator_id BIGINT UNSIGNED NULL,
  remark TEXT NULL,
  version INT NOT NULL DEFAULT 0,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_stock_check_order_no (check_no),
  KEY idx_stock_check_order_status_created (status, created_at),
  CONSTRAINT chk_stock_check_order_status CHECK (
    status IN ('pending','counting','completed','cancelled')
  ),
  CONSTRAINT chk_stock_check_order_version CHECK (version >= 0),
  CONSTRAINT chk_stock_check_order_state CHECK (
    (status IN ('pending','counting') AND check_at IS NULL AND operator_id IS NULL)
    OR (status = 'completed' AND check_at IS NOT NULL AND operator_id IS NOT NULL)
    OR (status = 'cancelled' AND check_at IS NULL)
  ),
  CONSTRAINT fk_stock_check_order_operator FOREIGN KEY (operator_id) REFERENCES users(id),
  CONSTRAINT fk_stock_check_order_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_stock_check_order_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE stock_check_detail (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  stock_check_id BIGINT UNSIGNED NOT NULL,
  item_id BIGINT UNSIGNED NOT NULL,
  batch_id BIGINT UNSIGNED NOT NULL,
  stock_status VARCHAR(20) NOT NULL,
  unit_snapshot VARCHAR(20) NOT NULL,
  system_quantity DECIMAL(12,4) NOT NULL,
  actual_quantity DECIMAL(12,4) NULL,
  difference_quantity DECIMAL(12,4)
    GENERATED ALWAYS AS (
      CASE WHEN actual_quantity IS NULL THEN NULL ELSE actual_quantity - system_quantity END
    ) STORED,
  result VARCHAR(20)
    GENERATED ALWAYS AS (
      CASE
        WHEN actual_quantity IS NULL THEN NULL
        WHEN actual_quantity > system_quantity THEN 'surplus'
        WHEN actual_quantity < system_quantity THEN 'shortage'
        ELSE 'matched'
      END
    ) STORED,
  adjusted TINYINT NOT NULL DEFAULT 0,
  remark TEXT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_stock_check_detail_target (stock_check_id, item_id, batch_id, stock_status),
  KEY idx_stock_check_detail_batch_status (batch_id, stock_status),
  CONSTRAINT chk_stock_check_detail_system_quantity CHECK (system_quantity > 0),
  CONSTRAINT chk_stock_check_detail_actual_quantity CHECK (
    actual_quantity IS NULL OR actual_quantity >= 0
  ),
  CONSTRAINT chk_stock_check_detail_stock_status CHECK (
    stock_status IN ('available','pending_inspection','frozen','defective')
  ),
  CONSTRAINT chk_stock_check_detail_adjusted CHECK (adjusted IN (0,1)),
  CONSTRAINT fk_stock_check_detail_order FOREIGN KEY (stock_check_id)
    REFERENCES stock_check_order(id),
  CONSTRAINT fk_stock_check_detail_item FOREIGN KEY (item_id) REFERENCES products(id),
  CONSTRAINT fk_stock_check_detail_batch_item FOREIGN KEY (batch_id, item_id)
    REFERENCES item_batch(id, item_id),
  CONSTRAINT fk_stock_check_detail_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO permissions
  (parent_id,name,code,type,route_path,api_method,api_path,sort_order,status)
VALUES
  (NULL,'仓储管理','warehouse:view','menu',NULL,NULL,NULL,400,1)
ON DUPLICATE KEY UPDATE name=VALUES(name),type=VALUES(type),sort_order=VALUES(sort_order),status=1,deleted_at=NULL;

INSERT INTO permissions
  (parent_id,name,code,type,route_path,api_method,api_path,sort_order,status)
SELECT id,'退料管理','warehouse:returns:view','page','/warehouse/return-orders',NULL,NULL,410,1
FROM permissions WHERE code='warehouse:view'
UNION ALL
SELECT id,'盘点管理','warehouse:stock-checks:view','page','/warehouse/stock-checks',NULL,NULL,420,1
FROM permissions WHERE code='warehouse:view'
ON DUPLICATE KEY UPDATE parent_id=VALUES(parent_id),name=VALUES(name),type=VALUES(type),route_path=VALUES(route_path),sort_order=VALUES(sort_order),status=1,deleted_at=NULL;

INSERT INTO permissions
  (parent_id,name,code,type,route_path,api_method,api_path,sort_order,status)
SELECT id,'创建退料单','warehouse:returns:create','api',NULL,'POST','/api/warehouse/return-orders',411,1
FROM permissions WHERE code='warehouse:returns:view'
UNION ALL
SELECT id,'确认退料入库','warehouse:returns:confirm','api',NULL,'POST','/api/warehouse/return-orders/:returnId/actions/confirm',412,1
FROM permissions WHERE code='warehouse:returns:view'
UNION ALL
SELECT id,'取消退料单','warehouse:returns:cancel','api',NULL,'POST','/api/warehouse/return-orders/:returnId/actions/cancel',413,1
FROM permissions WHERE code='warehouse:returns:view'
UNION ALL
SELECT id,'创建盘点单','warehouse:stock-checks:create','api',NULL,'POST','/api/warehouse/stock-checks',421,1
FROM permissions WHERE code='warehouse:stock-checks:view'
UNION ALL
SELECT id,'录入盘点数量','warehouse:stock-checks:count','api',NULL,'PATCH','/api/warehouse/stock-checks/:stockCheckId',422,1
FROM permissions WHERE code='warehouse:stock-checks:view'
UNION ALL
SELECT id,'完成库存盘点','warehouse:stock-checks:complete','api',NULL,'POST','/api/warehouse/stock-checks/:stockCheckId/actions/complete',423,1
FROM permissions WHERE code='warehouse:stock-checks:view'
UNION ALL
SELECT id,'取消库存盘点','warehouse:stock-checks:cancel','api',NULL,'POST','/api/warehouse/stock-checks/:stockCheckId/actions/cancel',424,1
FROM permissions WHERE code='warehouse:stock-checks:view'
ON DUPLICATE KEY UPDATE parent_id=VALUES(parent_id),name=VALUES(name),type=VALUES(type),api_method=VALUES(api_method),api_path=VALUES(api_path),sort_order=VALUES(sort_order),status=1,deleted_at=NULL;
