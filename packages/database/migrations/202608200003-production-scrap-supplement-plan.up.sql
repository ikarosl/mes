CREATE TABLE production_scrap_supplement_plan (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  plan_no VARCHAR(100) NOT NULL,
  abnormal_disposition_id BIGINT UNSIGNED NOT NULL,
  production_batch_id BIGINT UNSIGNED NOT NULL,
  batch_step_record_id BIGINT UNSIGNED NOT NULL,
  source_report_id BIGINT UNSIGNED NOT NULL,
  material_end_step_record_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  confirmed_supplement_id BIGINT UNSIGNED NULL,
  remark TEXT NULL,
  version INT NOT NULL DEFAULT 0,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_production_scrap_supplement_plan_no (plan_no),
  UNIQUE KEY uk_production_scrap_supplement_plan_disposition (abnormal_disposition_id),
  UNIQUE KEY uk_production_scrap_supplement_plan_supplement (confirmed_supplement_id),
  UNIQUE KEY uk_production_scrap_supplement_plan_batch_reference (id, production_batch_id),
  KEY idx_production_scrap_supplement_plan_batch_status (
    production_batch_id,
    status,
    updated_at
  ),
  CONSTRAINT chk_production_scrap_supplement_plan_status CHECK (
    (
      status = 'draft'
      AND confirmed_supplement_id IS NULL
    )
    OR
    (
      status = 'confirmed'
      AND confirmed_supplement_id IS NOT NULL
    )
  ),
  CONSTRAINT chk_production_scrap_supplement_plan_version CHECK (version >= 0),
  CONSTRAINT fk_production_scrap_supplement_plan_disposition FOREIGN KEY (
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
  CONSTRAINT fk_production_scrap_supplement_plan_material_end_step FOREIGN KEY (
    material_end_step_record_id,
    production_batch_id
  ) REFERENCES batch_step_records (id, production_batch_id),
  CONSTRAINT fk_production_scrap_supplement_plan_supplement FOREIGN KEY (
    confirmed_supplement_id,
    production_batch_id
  ) REFERENCES production_material_supplement (id, production_batch_id),
  CONSTRAINT fk_production_scrap_supplement_plan_created_by FOREIGN KEY (created_by)
    REFERENCES users(id),
  CONSTRAINT fk_production_scrap_supplement_plan_updated_by FOREIGN KEY (updated_by)
    REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE production_scrap_supplement_plan_line (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  plan_id BIGINT UNSIGNED NOT NULL,
  production_batch_id BIGINT UNSIGNED NOT NULL,
  original_demand_id BIGINT UNSIGNED NOT NULL,
  product_material_id BIGINT UNSIGNED NOT NULL,
  item_id BIGINT UNSIGNED NOT NULL,
  planned_quantity DECIMAL(12,4) NOT NULL,
  unit_snapshot VARCHAR(20) NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_production_scrap_supplement_plan_line_demand (
    plan_id,
    original_demand_id
  ),
  KEY idx_production_scrap_supplement_plan_line_batch (
    production_batch_id,
    plan_id
  ),
  CONSTRAINT chk_production_scrap_supplement_plan_line_quantity CHECK (
    planned_quantity > 0
  ),
  CONSTRAINT fk_production_scrap_supplement_plan_line_plan FOREIGN KEY (
    plan_id,
    production_batch_id
  ) REFERENCES production_scrap_supplement_plan (id, production_batch_id),
  CONSTRAINT fk_production_scrap_supplement_plan_line_demand FOREIGN KEY (
    original_demand_id,
    production_batch_id,
    product_material_id,
    item_id
  ) REFERENCES production_item_demand (
    id,
    production_batch_id,
    product_material_id,
    item_id
  ),
  CONSTRAINT fk_production_scrap_supplement_plan_line_created_by FOREIGN KEY (created_by)
    REFERENCES users(id),
  CONSTRAINT fk_production_scrap_supplement_plan_line_updated_by FOREIGN KEY (updated_by)
    REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
