-- 旧结构无法表达一张追加单的多物料明细；开发期回滚时清除该类事实后恢复旧约束。
UPDATE permissions
SET name = '人工补充需求',
    api_path = '/api/production/material-demands/:demandId/additions'
WHERE code = 'production:material-demands:add-manual';

DELETE FROM production_item_demand WHERE demand_type = 'manual_additional';
DELETE FROM production_manual_demand_addition;

ALTER TABLE production_item_demand
  DROP CHECK chk_production_item_demand_source,
  DROP FOREIGN KEY fk_production_item_demand_manual_addition,
  DROP INDEX fk_production_item_demand_manual_addition;

ALTER TABLE production_manual_demand_addition
  DROP INDEX uk_production_manual_demand_addition_batch,
  ADD COLUMN requirement_basis_id BIGINT UNSIGNED NOT NULL AFTER production_batch_id,
  ADD COLUMN parent_demand_id BIGINT UNSIGNED NOT NULL AFTER requirement_basis_id,
  ADD UNIQUE KEY uk_production_manual_demand_addition_reference (
    id,
    parent_demand_id,
    requirement_basis_id,
    production_batch_id
  ),
  ADD CONSTRAINT fk_manual_demand_addition_parent FOREIGN KEY (
    parent_demand_id,
    production_batch_id,
    requirement_basis_id
  ) REFERENCES production_item_demand(id, production_batch_id, requirement_basis_id);

ALTER TABLE production_item_demand
  ADD CONSTRAINT fk_production_item_demand_manual_addition FOREIGN KEY (
    manual_addition_id,
    parent_demand_id,
    requirement_basis_id,
    production_batch_id
  ) REFERENCES production_manual_demand_addition (
    id,
    parent_demand_id,
    requirement_basis_id,
    production_batch_id
  ),
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
      AND parent_demand_id IS NOT NULL
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
