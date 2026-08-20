CREATE TABLE item_scrap (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  scrap_no VARCHAR(100) NOT NULL,
  production_batch_id BIGINT UNSIGNED NOT NULL,
  demand_id BIGINT UNSIGNED NOT NULL,
  allocation_id BIGINT UNSIGNED NOT NULL,
  item_id BIGINT UNSIGNED NOT NULL,
  batch_id BIGINT UNSIGNED NOT NULL,
  scrap_scene VARCHAR(40) NOT NULL DEFAULT 'production_consumed',
  scrap_number DECIMAL(12,4) NOT NULL,
  unit_snapshot VARCHAR(20) NOT NULL,
  reason_type VARCHAR(50) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  confirmed_by BIGINT UNSIGNED NULL,
  confirmed_at DATETIME NULL,
  remark TEXT NULL,
  version INT NOT NULL DEFAULT 0,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_item_scrap_no (scrap_no),
  UNIQUE KEY uk_item_scrap_id_batch (id, production_batch_id),
  KEY idx_item_scrap_status_created (status, created_at),
  KEY idx_item_scrap_batch_status (production_batch_id, status, created_at),
  KEY idx_item_scrap_allocation_status (allocation_id, status, created_at),
  CONSTRAINT chk_item_scrap_current_scene CHECK (scrap_scene = 'production_consumed'),
  CONSTRAINT chk_item_scrap_quantity CHECK (scrap_number > 0),
  CONSTRAINT chk_item_scrap_reason CHECK (CHAR_LENGTH(TRIM(reason_type)) > 0),
  CONSTRAINT chk_item_scrap_version CHECK (version >= 0),
  CONSTRAINT chk_item_scrap_state CHECK (
    (status = 'pending' AND confirmed_by IS NULL AND confirmed_at IS NULL)
    OR (status = 'confirmed' AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)
    OR (status = 'cancelled' AND confirmed_by IS NULL AND confirmed_at IS NULL)
  ),
  CONSTRAINT fk_item_scrap_batch FOREIGN KEY (production_batch_id)
    REFERENCES production_batches(id),
  CONSTRAINT fk_item_scrap_demand_batch FOREIGN KEY (demand_id, production_batch_id)
    REFERENCES production_item_demand(id, production_batch_id),
  CONSTRAINT fk_item_scrap_allocation FOREIGN KEY (
    allocation_id,
    demand_id,
    production_batch_id,
    item_id,
    batch_id
  ) REFERENCES production_item_allocation(id, demand_id, production_batch_id, item_id, batch_id),
  CONSTRAINT fk_item_scrap_batch_item FOREIGN KEY (batch_id, item_id)
    REFERENCES item_batch(id, item_id),
  CONSTRAINT fk_item_scrap_confirmed_by FOREIGN KEY (confirmed_by) REFERENCES users(id),
  CONSTRAINT fk_item_scrap_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_item_scrap_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE production_material_supplement
  DROP FOREIGN KEY fk_production_material_supplement_scrap,
  RENAME COLUMN scrap_record_id TO step_scrap_record_id,
  RENAME INDEX uk_production_material_supplement_scrap
    TO uk_production_material_supplement_step_scrap;

ALTER TABLE production_material_supplement
  ADD COLUMN source_type VARCHAR(40) NOT NULL DEFAULT 'step_scrap_reproduction'
    AFTER supplement_no,
  MODIFY COLUMN step_scrap_record_id BIGINT UNSIGNED NULL,
  ADD COLUMN material_loss_scrap_id BIGINT UNSIGNED NULL AFTER step_scrap_record_id,
  MODIFY COLUMN batch_step_record_id BIGINT UNSIGNED NULL,
  ADD COLUMN version INT NOT NULL DEFAULT 0 AFTER remark,
  ADD COLUMN updated_by BIGINT UNSIGNED NULL AFTER created_at,
  ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP AFTER updated_by;

UPDATE production_material_supplement
SET updated_by = created_by;

ALTER TABLE production_material_supplement
  MODIFY COLUMN updated_by BIGINT UNSIGNED NOT NULL,
  ADD UNIQUE KEY uk_production_material_supplement_material_loss (material_loss_scrap_id),
  ADD KEY idx_production_material_supplement_source_status (source_type, status, created_at),
  ADD CONSTRAINT fk_production_material_supplement_step_scrap FOREIGN KEY (
    step_scrap_record_id,
    production_batch_id,
    batch_step_record_id
  ) REFERENCES batch_step_scrap_records(id, production_batch_id, batch_step_record_id),
  ADD CONSTRAINT fk_production_material_supplement_material_loss FOREIGN KEY (
    material_loss_scrap_id,
    production_batch_id
  ) REFERENCES item_scrap(id, production_batch_id),
  ADD CONSTRAINT fk_production_material_supplement_updated_by FOREIGN KEY (updated_by)
    REFERENCES users(id),
  ADD CONSTRAINT chk_production_material_supplement_source CHECK (
    (
      source_type = 'step_scrap_reproduction'
      AND step_scrap_record_id IS NOT NULL
      AND material_loss_scrap_id IS NULL
      AND batch_step_record_id IS NOT NULL
    )
    OR
    (
      source_type = 'material_loss'
      AND step_scrap_record_id IS NULL
      AND material_loss_scrap_id IS NOT NULL
      AND batch_step_record_id IS NULL
    )
  ),
  ADD CONSTRAINT chk_production_material_supplement_version CHECK (version >= 0);

ALTER TABLE production_item_demand
  DROP CHECK chk_production_item_demand_source,
  ADD CONSTRAINT chk_production_item_demand_source CHECK (
    (
      demand_type = 'normal'
      AND parent_demand_id IS NULL
      AND supplement_id IS NULL
    )
    OR
    (
      demand_type = 'manual_additional'
      AND parent_demand_id IS NOT NULL
      AND supplement_id IS NULL
    )
    OR
    (
      demand_type IN ('scrap_supplement', 'material_loss_supplement')
      AND parent_demand_id IS NOT NULL
      AND supplement_id IS NOT NULL
    )
  );

INSERT INTO permissions
  (parent_id,name,code,type,route_path,api_method,api_path,sort_order,status)
SELECT id,'报废管理','warehouse:scraps:view','page','/warehouse/scraps',NULL,NULL,430,1
FROM permissions WHERE code='warehouse:view'
ON DUPLICATE KEY UPDATE parent_id=VALUES(parent_id),name=VALUES(name),type=VALUES(type),
  route_path=VALUES(route_path),sort_order=VALUES(sort_order),status=1,deleted_at=NULL;

INSERT INTO permissions
  (parent_id,name,code,type,route_path,api_method,api_path,sort_order,status)
SELECT id,'申报生产领料损耗','warehouse:scraps:create','api',NULL,'POST','/api/warehouse/scraps',431,1
FROM permissions WHERE code='warehouse:scraps:view'
UNION ALL
SELECT id,'确认生产领料损耗','warehouse:scraps:confirm','api',NULL,'POST','/api/warehouse/scraps/:scrapId/actions/confirm',432,1
FROM permissions WHERE code='warehouse:scraps:view'
UNION ALL
SELECT id,'取消生产领料损耗','warehouse:scraps:cancel','api',NULL,'POST','/api/warehouse/scraps/:scrapId/actions/cancel',433,1
FROM permissions WHERE code='warehouse:scraps:view'
ON DUPLICATE KEY UPDATE parent_id=VALUES(parent_id),name=VALUES(name),type=VALUES(type),
  api_method=VALUES(api_method),api_path=VALUES(api_path),sort_order=VALUES(sort_order),
  status=1,deleted_at=NULL;
