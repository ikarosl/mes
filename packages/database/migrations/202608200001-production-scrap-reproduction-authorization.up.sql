CREATE TEMPORARY TABLE tmp_scrap_reproduction_upgrade_guard (
  invalid_value TINYINT NOT NULL,
  CONSTRAINT chk_tmp_scrap_reproduction_upgrade_guard CHECK (invalid_value = 0)
) ENGINE = MEMORY;

INSERT INTO tmp_scrap_reproduction_upgrade_guard (invalid_value)
SELECT 1
FROM production_item_demand
WHERE business_status NOT IN ('active', 'cancelled')
   OR source_scrap_id IS NOT NULL
   OR created_by IS NULL
   OR updated_by IS NULL
LIMIT 1;

INSERT INTO tmp_scrap_reproduction_upgrade_guard (invalid_value)
SELECT 1
FROM production_item_demand demand
LEFT JOIN production_material_supplement_detail detail
  ON detail.id = demand.source_supplement_detail_id
WHERE demand.demand_type = 'scrap_supplement'
  AND (
    detail.id IS NULL
    OR detail.production_batch_id <> demand.production_batch_id
    OR detail.product_material_id <> demand.product_material_id
    OR detail.item_id <> demand.item_id
    OR detail.original_demand_id <> demand.parent_demand_id
    OR detail.supplement_quantity <> demand.need_number
    OR detail.unit_snapshot <> demand.unit_snapshot
  )
LIMIT 1;

DROP TEMPORARY TABLE tmp_scrap_reproduction_upgrade_guard;

ALTER TABLE batch_step_reports
  ADD COLUMN abnormal_origin VARCHAR(30) NULL AFTER abnormal_quantity;

UPDATE batch_step_reports
SET abnormal_origin = 'current_step'
WHERE abnormal_quantity > 0;

ALTER TABLE batch_step_reports
  ADD CONSTRAINT chk_batch_step_reports_abnormal_origin CHECK (
    (abnormal_quantity = 0 AND abnormal_origin IS NULL)
    OR
    (
      abnormal_quantity > 0
      AND abnormal_origin IN ('current_step', 'previous_step')
    )
  );

ALTER TABLE production_item_demand
  ADD COLUMN supplement_id BIGINT UNSIGNED NULL AFTER parent_demand_id;

UPDATE production_item_demand demand
JOIN production_material_supplement_detail detail
  ON detail.id = demand.source_supplement_detail_id
SET demand.supplement_id = detail.supplement_id
WHERE demand.demand_type = 'scrap_supplement';

ALTER TABLE production_item_demand
  DROP FOREIGN KEY fk_production_item_demand_source_supplement,
  DROP FOREIGN KEY fk_production_item_demand_parent,
  DROP FOREIGN KEY fk_production_item_demand_created_by,
  DROP FOREIGN KEY fk_production_item_demand_updated_by,
  DROP CHECK chk_production_item_demand_source,
  DROP CHECK chk_production_item_demand_status;

ALTER TABLE production_item_demand
  DROP INDEX idx_production_item_demand_source_supplement,
  DROP INDEX fk_production_item_demand_source_supplement,
  DROP INDEX idx_production_item_demand_source_scrap,
  DROP INDEX idx_production_item_demand_parent,
  DROP COLUMN source_supplement_detail_id,
  DROP COLUMN source_scrap_id,
  DROP COLUMN reason_type,
  DROP COLUMN remark,
  MODIFY COLUMN created_by BIGINT UNSIGNED NOT NULL,
  MODIFY COLUMN updated_by BIGINT UNSIGNED NOT NULL,
  ADD UNIQUE KEY uk_production_item_demand_parent_reference (
    id,
    production_batch_id,
    product_material_id,
    item_id
  ),
  ADD UNIQUE KEY uk_production_item_demand_supplement_parent (
    supplement_id,
    parent_demand_id
  ),
  ADD KEY idx_production_item_demand_parent (parent_demand_id),
  ADD KEY idx_production_item_demand_supplement (supplement_id, business_status);

ALTER TABLE production_item_demand
  ADD CONSTRAINT fk_production_item_demand_parent FOREIGN KEY (
    parent_demand_id,
    production_batch_id,
    product_material_id,
    item_id
  ) REFERENCES production_item_demand (
    id,
    production_batch_id,
    product_material_id,
    item_id
  ),
  ADD CONSTRAINT fk_production_item_demand_supplement FOREIGN KEY (
    supplement_id,
    production_batch_id
  ) REFERENCES production_material_supplement (id, production_batch_id),
  ADD CONSTRAINT fk_production_item_demand_created_by FOREIGN KEY (created_by)
    REFERENCES users(id),
  ADD CONSTRAINT fk_production_item_demand_updated_by FOREIGN KEY (updated_by)
    REFERENCES users(id),
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
      demand_type = 'scrap_supplement'
      AND parent_demand_id IS NOT NULL
      AND supplement_id IS NOT NULL
    )
  ),
  ADD CONSTRAINT chk_production_item_demand_status CHECK (
    business_status IN ('active', 'cancelled')
  );

ALTER TABLE production_material_supplement
  DROP FOREIGN KEY fk_production_material_supplement_activated_by,
  DROP CHECK chk_production_material_supplement_status,
  DROP INDEX idx_production_material_supplement_activation;

UPDATE production_material_supplement
SET status = 'fulfilled'
WHERE status = 'activated';

ALTER TABLE production_material_supplement
  RENAME COLUMN activated_at TO fulfilled_at,
  RENAME COLUMN activated_by TO fulfilled_by,
  ADD KEY idx_production_material_supplement_fulfillment (
    production_batch_id,
    status,
    batch_step_record_id
  ),
  ADD CONSTRAINT fk_production_material_supplement_fulfilled_by FOREIGN KEY (fulfilled_by)
    REFERENCES users(id),
  ADD CONSTRAINT chk_production_material_supplement_status CHECK (
    (
      status = 'approved'
      AND fulfilled_at IS NULL
      AND fulfilled_by IS NULL
    )
    OR
    (
      status = 'fulfilled'
      AND fulfilled_at IS NOT NULL
      AND fulfilled_by IS NOT NULL
    )
  );

CREATE TABLE batch_step_scrap_reproduction_authorization (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  production_batch_id BIGINT UNSIGNED NOT NULL,
  scrap_record_id BIGINT UNSIGNED NOT NULL,
  supplement_id BIGINT UNSIGNED NOT NULL,
  entry_step_record_id BIGINT UNSIGNED NOT NULL,
  quota_end_step_record_id BIGINT UNSIGNED NOT NULL,
  material_end_step_record_id BIGINT UNSIGNED NOT NULL,
  authorized_quantity DECIMAL(12,4) NOT NULL,
  authorized_by BIGINT UNSIGNED NOT NULL,
  authorized_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_scrap_reproduction_authorization_scrap (scrap_record_id),
  UNIQUE KEY uk_scrap_reproduction_authorization_supplement (supplement_id),
  KEY idx_scrap_reproduction_authorization_batch (
    production_batch_id,
    quota_end_step_record_id,
    authorized_at
  ),
  CONSTRAINT chk_scrap_reproduction_authorization_quantity CHECK (authorized_quantity > 0),
  CONSTRAINT fk_scrap_reproduction_authorization_scrap FOREIGN KEY (
    scrap_record_id,
    production_batch_id,
    quota_end_step_record_id
  ) REFERENCES batch_step_scrap_records (
    id,
    production_batch_id,
    batch_step_record_id
  ),
  CONSTRAINT fk_scrap_reproduction_authorization_supplement FOREIGN KEY (
    supplement_id,
    production_batch_id
  ) REFERENCES production_material_supplement (id, production_batch_id),
  CONSTRAINT fk_scrap_reproduction_authorization_entry_step FOREIGN KEY (
    entry_step_record_id,
    production_batch_id
  ) REFERENCES batch_step_records (id, production_batch_id),
  CONSTRAINT fk_scrap_reproduction_authorization_material_end_step FOREIGN KEY (
    material_end_step_record_id,
    production_batch_id
  ) REFERENCES batch_step_records (id, production_batch_id),
  CONSTRAINT fk_scrap_reproduction_authorization_authorized_by FOREIGN KEY (authorized_by)
    REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO batch_step_scrap_reproduction_authorization (
  production_batch_id,
  scrap_record_id,
  supplement_id,
  entry_step_record_id,
  quota_end_step_record_id,
  material_end_step_record_id,
  authorized_quantity,
  authorized_by,
  authorized_at
)
SELECT
  scrap.production_batch_id,
  scrap.id,
  supplement.id,
  (
    SELECT first_step.id
    FROM batch_step_records first_step
    WHERE first_step.production_batch_id = scrap.production_batch_id
    ORDER BY first_step.step_order_snapshot, first_step.id
    LIMIT 1
  ),
  scrap.batch_step_record_id,
  scrap.batch_step_record_id,
  scrap.scrap_quantity,
  disposition.reviewed_by,
  disposition.reviewed_at
FROM batch_step_scrap_records scrap
JOIN batch_step_abnormal_dispositions disposition
  ON disposition.id = scrap.abnormal_disposition_id
JOIN production_material_supplement supplement
  ON supplement.scrap_record_id = scrap.id;

DROP TABLE production_material_supplement_detail;
