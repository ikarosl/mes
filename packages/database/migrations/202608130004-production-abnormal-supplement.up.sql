CREATE TABLE batch_step_scrap_records (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  abnormal_disposition_id BIGINT UNSIGNED NOT NULL,
  production_batch_id BIGINT UNSIGNED NOT NULL,
  batch_step_record_id BIGINT UNSIGNED NOT NULL,
  source_report_id BIGINT UNSIGNED NOT NULL,
  scrap_quantity DECIMAL(12,4) NOT NULL,
  unit_snapshot VARCHAR(20) NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_batch_step_scrap_records_disposition (abnormal_disposition_id),
  UNIQUE KEY uk_batch_step_scrap_records_batch_step_reference (
    id,
    production_batch_id,
    batch_step_record_id
  ),
  UNIQUE KEY uk_batch_step_scrap_records_source (
    id,
    production_batch_id,
    batch_step_record_id,
    source_report_id
  ),
  KEY idx_batch_step_scrap_records_batch_step (
    production_batch_id,
    batch_step_record_id,
    created_at
  ),
  CONSTRAINT chk_batch_step_scrap_records_quantity CHECK (scrap_quantity > 0),
  CONSTRAINT fk_batch_step_scrap_records_disposition_source FOREIGN KEY (
    abnormal_disposition_id,
    production_batch_id,
    batch_step_record_id,
    source_report_id
  ) REFERENCES batch_step_abnormal_dispositions (
    id,
    production_batch_id,
    batch_step_record_id,
    batch_step_report_id
  ),
  CONSTRAINT fk_batch_step_scrap_records_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE production_material_supplement (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  supplement_no VARCHAR(100) NOT NULL,
  scrap_record_id BIGINT UNSIGNED NOT NULL,
  production_batch_id BIGINT UNSIGNED NOT NULL,
  batch_step_record_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'approved',
  remark TEXT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_production_material_supplement_no (supplement_no),
  UNIQUE KEY uk_production_material_supplement_scrap (scrap_record_id),
  UNIQUE KEY uk_production_material_supplement_batch_reference (id, production_batch_id),
  KEY idx_production_material_supplement_batch_created (production_batch_id, created_at),
  CONSTRAINT chk_production_material_supplement_status CHECK (status = 'approved'),
  CONSTRAINT fk_production_material_supplement_scrap FOREIGN KEY (
    scrap_record_id,
    production_batch_id,
    batch_step_record_id
  ) REFERENCES batch_step_scrap_records (
    id,
    production_batch_id,
    batch_step_record_id
  ),
  CONSTRAINT fk_production_material_supplement_created_by FOREIGN KEY (created_by)
    REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

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

ALTER TABLE production_item_demand
  DROP CHECK chk_production_item_demand_source,
  DROP CHECK chk_production_item_demand_type,
  ADD COLUMN source_supplement_detail_id BIGINT UNSIGNED NULL AFTER source_scrap_id,
  ADD KEY idx_production_item_demand_source_supplement (source_supplement_detail_id),
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
  ADD CONSTRAINT chk_production_item_demand_type
    CHECK (demand_type IN ('normal', 'manual_additional', 'scrap_supplement')),
  ADD CONSTRAINT chk_production_item_demand_source
    CHECK (
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
    );
