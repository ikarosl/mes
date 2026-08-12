CREATE TEMPORARY TABLE tmp_production_supplement_rollback_guard (
  invalid_value TINYINT NOT NULL,
  CONSTRAINT chk_tmp_production_supplement_rollback_guard CHECK (invalid_value = 0)
);

INSERT INTO tmp_production_supplement_rollback_guard (invalid_value)
SELECT 1
FROM production_item_demand
WHERE demand_type = 'scrap_supplement'
LIMIT 1;

DROP TEMPORARY TABLE tmp_production_supplement_rollback_guard;

ALTER TABLE production_item_demand
  DROP FOREIGN KEY fk_production_item_demand_source_supplement,
  DROP CHECK chk_production_item_demand_source,
  DROP CHECK chk_production_item_demand_type,
  DROP INDEX idx_production_item_demand_source_supplement,
  DROP COLUMN source_supplement_detail_id,
  ADD CONSTRAINT chk_production_item_demand_type
    CHECK (demand_type IN ('normal', 'manual_additional')),
  ADD CONSTRAINT chk_production_item_demand_source
    CHECK (
      (demand_type = 'normal' AND parent_demand_id IS NULL AND source_scrap_id IS NULL)
      OR
      (
        demand_type = 'manual_additional'
        AND parent_demand_id IS NOT NULL
        AND source_scrap_id IS NULL
      )
    );

DROP TABLE production_material_supplement_detail;
DROP TABLE production_material_supplement;
DROP TABLE batch_step_scrap_records;
