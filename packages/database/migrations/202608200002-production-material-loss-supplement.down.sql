CREATE TEMPORARY TABLE tmp_material_loss_rollback_guard (
  invalid_value TINYINT NOT NULL,
  CONSTRAINT chk_tmp_material_loss_rollback_guard CHECK (invalid_value = 0)
) ENGINE=MEMORY;

INSERT INTO tmp_material_loss_rollback_guard (invalid_value)
SELECT 1 FROM item_scrap LIMIT 1;

DROP TEMPORARY TABLE tmp_material_loss_rollback_guard;

DELETE FROM permissions WHERE code IN (
  'warehouse:scraps:create',
  'warehouse:scraps:confirm',
  'warehouse:scraps:cancel'
);
DELETE FROM permissions WHERE code='warehouse:scraps:view';

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
      demand_type = 'scrap_supplement'
      AND parent_demand_id IS NOT NULL
      AND supplement_id IS NOT NULL
    )
  );

ALTER TABLE production_material_supplement
  DROP FOREIGN KEY fk_production_material_supplement_step_scrap,
  DROP FOREIGN KEY fk_production_material_supplement_material_loss,
  DROP FOREIGN KEY fk_production_material_supplement_updated_by,
  DROP CHECK chk_production_material_supplement_source,
  DROP CHECK chk_production_material_supplement_version,
  DROP INDEX uk_production_material_supplement_material_loss,
  DROP INDEX idx_production_material_supplement_source_status,
  DROP COLUMN source_type,
  DROP COLUMN material_loss_scrap_id,
  DROP COLUMN version,
  DROP COLUMN updated_by,
  DROP COLUMN updated_at;

ALTER TABLE production_material_supplement
  MODIFY COLUMN step_scrap_record_id BIGINT UNSIGNED NOT NULL,
  MODIFY COLUMN batch_step_record_id BIGINT UNSIGNED NOT NULL;

ALTER TABLE production_material_supplement
  RENAME COLUMN step_scrap_record_id TO scrap_record_id,
  RENAME INDEX uk_production_material_supplement_step_scrap
    TO uk_production_material_supplement_scrap;

ALTER TABLE production_material_supplement
  ADD CONSTRAINT fk_production_material_supplement_scrap FOREIGN KEY (
    scrap_record_id,
    production_batch_id,
    batch_step_record_id
  ) REFERENCES batch_step_scrap_records(id, production_batch_id, batch_step_record_id);

DROP TABLE item_scrap;
