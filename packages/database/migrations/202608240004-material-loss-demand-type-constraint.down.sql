CREATE TEMPORARY TABLE tmp_material_loss_demand_type_rollback_guard (
  invalid_value TINYINT NOT NULL,
  CONSTRAINT chk_tmp_material_loss_demand_type_rollback_guard CHECK (invalid_value = 0)
) ENGINE=MEMORY;

INSERT INTO tmp_material_loss_demand_type_rollback_guard (invalid_value)
SELECT 1
FROM production_item_demand
WHERE demand_type = 'material_loss_supplement'
LIMIT 1;

DROP TEMPORARY TABLE tmp_material_loss_demand_type_rollback_guard;

ALTER TABLE production_item_demand
  DROP CHECK chk_production_item_demand_type,
  ADD CONSTRAINT chk_production_item_demand_type CHECK (
    demand_type IN ('normal', 'manual_additional', 'scrap_supplement')
  );
