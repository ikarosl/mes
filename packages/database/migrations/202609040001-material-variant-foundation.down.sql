CREATE TEMPORARY TABLE tmp_material_variant_foundation_down_guard (
  invalid_value TINYINT NOT NULL,
  CONSTRAINT chk_tmp_material_variant_foundation_down_guard CHECK (invalid_value = 0)
) ENGINE=MEMORY;

-- A variant cannot be collapsed back into a base product without losing identity.
INSERT INTO tmp_material_variant_foundation_down_guard (invalid_value)
SELECT 1 FROM material_variants LIMIT 1;

DROP TEMPORARY TABLE tmp_material_variant_foundation_down_guard;

DELETE FROM permissions
WHERE code IN (
  'product:material-variants:view',
  'product:material-variants:create',
  'product:material-variants:change-status'
);

ALTER TABLE batch_step_scrap_reproduction_authorization
  ADD COLUMN material_end_step_record_id BIGINT UNSIGNED NULL
    AFTER quota_end_step_record_id;

UPDATE batch_step_scrap_reproduction_authorization
SET material_end_step_record_id = quota_end_step_record_id;

ALTER TABLE batch_step_scrap_reproduction_authorization
  MODIFY COLUMN material_end_step_record_id BIGINT UNSIGNED NOT NULL,
  ADD CONSTRAINT fk_scrap_reproduction_authorization_material_end_step FOREIGN KEY (
    material_end_step_record_id,
    production_batch_id
  ) REFERENCES batch_step_records(id, production_batch_id);

ALTER TABLE production_scrap_supplement_plan
  ADD COLUMN material_end_step_record_id BIGINT UNSIGNED NULL AFTER source_report_id;

UPDATE production_scrap_supplement_plan plan
JOIN batch_step_records step_record
  ON step_record.id = plan.batch_step_record_id
  AND step_record.production_batch_id = plan.production_batch_id
SET plan.material_end_step_record_id = step_record.id;

ALTER TABLE production_scrap_supplement_plan
  MODIFY COLUMN material_end_step_record_id BIGINT UNSIGNED NOT NULL,
  ADD CONSTRAINT fk_production_scrap_supplement_plan_material_end_step FOREIGN KEY (
    material_end_step_record_id,
    production_batch_id
  ) REFERENCES batch_step_records(id, production_batch_id);

CREATE TABLE route_step_materials (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  route_step_id BIGINT UNSIGNED NOT NULL,
  product_material_id BIGINT UNSIGNED NOT NULL,
  remark TEXT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_route_step_materials (route_step_id, product_material_id),
  CONSTRAINT fk_route_step_materials_step FOREIGN KEY (route_step_id)
    REFERENCES process_route_steps(id) ON DELETE RESTRICT,
  CONSTRAINT fk_route_step_materials_material FOREIGN KEY (product_material_id)
    REFERENCES product_materials(id) ON DELETE RESTRICT,
  CONSTRAINT fk_route_step_materials_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TRIGGER trg_material_variants_reject_identity_update;
DROP TRIGGER trg_products_reject_item_code_update;
DROP TABLE material_variants;

ALTER TABLE product_categories
  DROP CHECK chk_product_categories_kind,
  ADD CONSTRAINT chk_product_categories_kind
    CHECK (item_kind IN ('material', 'semi_finished', 'finished_product'));
