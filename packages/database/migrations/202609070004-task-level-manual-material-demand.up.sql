-- 人工追加是任务级生成动作，可包含冻结 BOM 中的多种基础物料和多个具体版本。
ALTER TABLE production_item_demand
  DROP CHECK chk_production_item_demand_source,
  DROP FOREIGN KEY fk_production_item_demand_manual_addition,
  DROP INDEX fk_production_item_demand_manual_addition;

ALTER TABLE production_manual_demand_addition
  DROP FOREIGN KEY fk_manual_demand_addition_parent,
  DROP INDEX uk_production_manual_demand_addition_reference,
  DROP COLUMN parent_demand_id,
  DROP COLUMN requirement_basis_id,
  ADD UNIQUE KEY uk_production_manual_demand_addition_batch (id, production_batch_id);

UPDATE production_item_demand
SET parent_demand_id = NULL
WHERE demand_type = 'manual_additional';

ALTER TABLE production_item_demand
  ADD CONSTRAINT fk_production_item_demand_manual_addition FOREIGN KEY (
    manual_addition_id,
    production_batch_id
  ) REFERENCES production_manual_demand_addition (id, production_batch_id),
  ADD CONSTRAINT chk_production_item_demand_source CHECK (
    (
      demand_type = 'normal'
      AND parent_demand_id IS NULL
      AND manual_addition_id IS NULL
      AND supplement_id IS NULL
    )
    OR
    (
      demand_type = 'manual_additional'
      AND parent_demand_id IS NULL
      AND manual_addition_id IS NOT NULL
      AND supplement_id IS NULL
    )
    OR
    (
      demand_type IN ('scrap_supplement', 'material_loss_supplement')
      AND parent_demand_id IS NOT NULL
      AND manual_addition_id IS NULL
      AND supplement_id IS NOT NULL
    )
  );

UPDATE permissions
SET name = '人工追加需求',
    api_path = '/api/production/batches/:batchId/material-demands/additions'
WHERE code = 'production:material-demands:add-manual';
