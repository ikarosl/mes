CREATE TEMPORARY TABLE tmp_scrap_reproduction_rollback_guard (
  invalid_value TINYINT NOT NULL,
  CONSTRAINT chk_tmp_scrap_reproduction_rollback_guard CHECK (invalid_value = 0)
) ENGINE = MEMORY;

INSERT INTO tmp_scrap_reproduction_rollback_guard (invalid_value)
SELECT 1
FROM batch_step_reports
WHERE abnormal_origin = 'previous_step'
LIMIT 1;

INSERT INTO tmp_scrap_reproduction_rollback_guard (invalid_value)
SELECT 1
FROM batch_step_scrap_reproduction_authorization
WHERE material_end_step_record_id <> quota_end_step_record_id
LIMIT 1;

DROP TEMPORARY TABLE tmp_scrap_reproduction_rollback_guard;

CREATE TABLE production_material_supplement_detail (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  supplement_id BIGINT UNSIGNED NOT NULL,
  production_batch_id BIGINT UNSIGNED NOT NULL,
  product_material_id BIGINT UNSIGNED NOT NULL,
  item_id BIGINT UNSIGNED NOT NULL,
  original_demand_id BIGINT UNSIGNED NOT NULL,
  supplement_quantity DECIMAL(12,4) NOT NULL,
  unit_snapshot VARCHAR(20) NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_production_material_supplement_detail_demand (
    supplement_id,
    original_demand_id
  ),
  UNIQUE KEY uk_production_material_supplement_detail_source (
    id,
    production_batch_id,
    product_material_id,
    item_id,
    original_demand_id
  ),
  KEY idx_production_material_supplement_detail_batch (production_batch_id, created_at),
  CONSTRAINT chk_production_material_supplement_detail_quantity CHECK (supplement_quantity > 0),
  CONSTRAINT fk_production_material_supplement_detail_header FOREIGN KEY (
    supplement_id,
    production_batch_id
  ) REFERENCES production_material_supplement (id, production_batch_id),
  CONSTRAINT fk_production_material_supplement_detail_material FOREIGN KEY (
    product_material_id,
    item_id
  ) REFERENCES product_materials(id, material_product_id),
  CONSTRAINT fk_production_material_supplement_detail_original_demand FOREIGN KEY (
    original_demand_id,
    production_batch_id
  ) REFERENCES production_item_demand(id, production_batch_id),
  CONSTRAINT fk_production_material_supplement_detail_created_by FOREIGN KEY (created_by)
    REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO production_material_supplement_detail (
  supplement_id,
  production_batch_id,
  product_material_id,
  item_id,
  original_demand_id,
  supplement_quantity,
  unit_snapshot,
  created_by,
  created_at
)
SELECT
  demand.supplement_id,
  demand.production_batch_id,
  demand.product_material_id,
  demand.item_id,
  demand.parent_demand_id,
  demand.need_number,
  demand.unit_snapshot,
  demand.created_by,
  demand.created_at
FROM production_item_demand demand
WHERE demand.demand_type = 'scrap_supplement';

ALTER TABLE production_item_demand
  DROP FOREIGN KEY fk_production_item_demand_parent,
  DROP FOREIGN KEY fk_production_item_demand_supplement,
  DROP FOREIGN KEY fk_production_item_demand_created_by,
  DROP FOREIGN KEY fk_production_item_demand_updated_by,
  DROP CHECK chk_production_item_demand_source,
  DROP CHECK chk_production_item_demand_status;

ALTER TABLE production_item_demand
  DROP INDEX uk_production_item_demand_parent_reference,
  DROP INDEX uk_production_item_demand_supplement_parent,
  DROP INDEX idx_production_item_demand_parent,
  DROP INDEX idx_production_item_demand_supplement,
  ADD COLUMN source_scrap_id BIGINT UNSIGNED NULL AFTER parent_demand_id,
  ADD COLUMN source_supplement_detail_id BIGINT UNSIGNED NULL AFTER source_scrap_id,
  ADD COLUMN reason_type VARCHAR(50) NULL AFTER source_supplement_detail_id,
  ADD COLUMN remark TEXT NULL AFTER version,
  MODIFY COLUMN created_by BIGINT UNSIGNED NULL,
  MODIFY COLUMN updated_by BIGINT UNSIGNED NULL;

UPDATE production_item_demand demand
JOIN production_material_supplement_detail detail
  ON detail.supplement_id = demand.supplement_id
  AND detail.original_demand_id = demand.parent_demand_id
SET
  demand.source_supplement_detail_id = detail.id,
  demand.reason_type = 'step_scrap',
  demand.remark = (
    SELECT supplement.remark
    FROM production_material_supplement supplement
    WHERE supplement.id = demand.supplement_id
  )
WHERE demand.demand_type = 'scrap_supplement';

ALTER TABLE production_item_demand
  DROP COLUMN supplement_id,
  ADD KEY idx_production_item_demand_parent (parent_demand_id),
  ADD KEY idx_production_item_demand_source_scrap (source_scrap_id),
  ADD KEY idx_production_item_demand_source_supplement (source_supplement_detail_id),
  ADD CONSTRAINT fk_production_item_demand_parent
    FOREIGN KEY (parent_demand_id) REFERENCES production_item_demand(id),
  ADD CONSTRAINT fk_production_item_demand_source_supplement FOREIGN KEY (
    source_supplement_detail_id,
    production_batch_id,
    product_material_id,
    item_id,
    parent_demand_id
  ) REFERENCES production_material_supplement_detail (
    id,
    production_batch_id,
    product_material_id,
    item_id,
    original_demand_id
  ),
  ADD CONSTRAINT fk_production_item_demand_created_by FOREIGN KEY (created_by)
    REFERENCES users(id),
  ADD CONSTRAINT fk_production_item_demand_updated_by FOREIGN KEY (updated_by)
    REFERENCES users(id),
  ADD CONSTRAINT chk_production_item_demand_source CHECK (
    (
      demand_type = 'normal'
      AND parent_demand_id IS NULL
      AND source_scrap_id IS NULL
      AND source_supplement_detail_id IS NULL
    )
    OR
    (
      demand_type = 'manual_additional'
      AND parent_demand_id IS NOT NULL
      AND source_scrap_id IS NULL
      AND source_supplement_detail_id IS NULL
    )
    OR
    (
      demand_type = 'scrap_supplement'
      AND parent_demand_id IS NOT NULL
      AND source_scrap_id IS NULL
      AND source_supplement_detail_id IS NOT NULL
    )
  ),
  ADD CONSTRAINT chk_production_item_demand_status CHECK (
    business_status IN ('active', 'cancelled', 'closed', 'frozen', 'abnormal')
  );

DROP TABLE batch_step_scrap_reproduction_authorization;

ALTER TABLE production_material_supplement
  DROP FOREIGN KEY fk_production_material_supplement_fulfilled_by,
  DROP CHECK chk_production_material_supplement_status,
  DROP INDEX idx_production_material_supplement_fulfillment;

UPDATE production_material_supplement
SET status = 'activated'
WHERE status = 'fulfilled';

ALTER TABLE production_material_supplement
  RENAME COLUMN fulfilled_at TO activated_at,
  RENAME COLUMN fulfilled_by TO activated_by,
  ADD KEY idx_production_material_supplement_activation (
    production_batch_id,
    status,
    batch_step_record_id
  ),
  ADD CONSTRAINT fk_production_material_supplement_activated_by FOREIGN KEY (activated_by)
    REFERENCES users(id),
  ADD CONSTRAINT chk_production_material_supplement_status CHECK (
    (
      status = 'approved'
      AND activated_at IS NULL
      AND activated_by IS NULL
    )
    OR
    (
      status = 'activated'
      AND activated_at IS NOT NULL
      AND activated_by IS NOT NULL
    )
  );

ALTER TABLE batch_step_reports
  DROP CHECK chk_batch_step_reports_abnormal_origin,
  DROP COLUMN abnormal_origin;
