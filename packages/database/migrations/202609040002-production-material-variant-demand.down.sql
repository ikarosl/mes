CREATE TEMPORARY TABLE tmp_material_variant_demand_down_guard (
  invalid_value TINYINT NOT NULL,
  CONSTRAINT chk_tmp_material_variant_demand_down_guard CHECK (invalid_value = 0)
) ENGINE=MEMORY;

-- Dropping exact variant identities or configured requirement bases would silently
-- change production and inventory facts. Reset those facts before rolling back.
INSERT INTO tmp_material_variant_demand_down_guard (invalid_value)
SELECT 1 FROM production_material_requirement_basis LIMIT 1;
INSERT INTO tmp_material_variant_demand_down_guard (invalid_value)
SELECT 1 FROM production_manual_demand_addition LIMIT 1;
INSERT INTO tmp_material_variant_demand_down_guard (invalid_value)
SELECT 1 FROM item_batch LIMIT 1;

DROP TEMPORARY TABLE tmp_material_variant_demand_down_guard;

DELETE FROM permissions
WHERE code IN (
  'production:material-demands:view',
  'production:material-demands:configure',
  'production:material-demands:add-manual'
);

DROP TRIGGER trg_item_batch_move_variant_balance;
DROP TRIGGER trg_inventory_transaction_cleanup_variant_balance;
DROP TRIGGER trg_inventory_transaction_update_variant_balance;
DROP TRIGGER trg_inventory_variant_balance_reject_negative_update;
DROP TRIGGER trg_inventory_variant_balance_reject_negative_insert;
DROP TABLE inventory_material_variant_balance;

ALTER TABLE inventory_transaction
  DROP FOREIGN KEY fk_inventory_transaction_batch_variant,
  DROP COLUMN material_variant_id;

ALTER TABLE production_scrap_supplement_plan_line
  DROP FOREIGN KEY fk_scrap_supplement_plan_line_variant,
  DROP FOREIGN KEY fk_scrap_supplement_plan_line_basis,
  DROP FOREIGN KEY fk_scrap_supplement_plan_line_basis_demand,
  DROP COLUMN material_variant_id,
  DROP COLUMN requirement_basis_id;

ALTER TABLE production_short_batch_authorization_detail
  DROP FOREIGN KEY fk_short_batch_authorization_detail_demand_variant,
  DROP COLUMN material_variant_id;

ALTER TABLE stock_check_detail
  DROP FOREIGN KEY fk_stock_check_detail_batch_variant,
  DROP FOREIGN KEY fk_stock_check_detail_variant,
  DROP COLUMN material_variant_id;

ALTER TABLE item_scrap
  DROP FOREIGN KEY fk_item_scrap_batch_variant,
  DROP FOREIGN KEY fk_item_scrap_allocation_variant,
  DROP COLUMN material_variant_id;

ALTER TABLE return_detail
  DROP FOREIGN KEY fk_return_detail_batch_variant,
  DROP FOREIGN KEY fk_return_detail_allocation_variant,
  DROP COLUMN material_variant_id;

ALTER TABLE inbound_detail
  DROP FOREIGN KEY fk_inbound_detail_batch_variant,
  DROP FOREIGN KEY fk_inbound_detail_variant,
  DROP COLUMN material_variant_id;

ALTER TABLE outbound_detail
  DROP FOREIGN KEY fk_outbound_detail_batch_variant,
  DROP FOREIGN KEY fk_outbound_detail_allocation_variant,
  DROP COLUMN material_variant_id;

ALTER TABLE production_item_allocation
  DROP FOREIGN KEY fk_production_item_allocation_batch_variant,
  DROP FOREIGN KEY fk_production_item_allocation_demand_variant,
  DROP INDEX uk_production_item_allocation_variant_reference,
  DROP COLUMN material_variant_id;

DROP TRIGGER trg_item_batch_reject_material_identity_update;

ALTER TABLE item_batch
  DROP FOREIGN KEY fk_item_batch_variant,
  DROP INDEX uk_item_batch_id_item_variant,
  DROP INDEX uk_item_batch_variant_code,
  DROP COLUMN material_variant_code_snapshot,
  DROP COLUMN material_variant_id,
  ADD UNIQUE KEY uk_item_batch_item_code (item_id, batch_code);

ALTER TABLE production_item_demand
  DROP CHECK chk_production_item_demand_source,
  DROP FOREIGN KEY fk_production_item_demand_manual_addition,
  DROP COLUMN manual_addition_id,
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
      demand_type IN ('scrap_supplement', 'material_loss_supplement')
      AND parent_demand_id IS NOT NULL
      AND supplement_id IS NOT NULL
    )
  );

DROP TABLE production_manual_demand_addition;

ALTER TABLE production_item_demand
  DROP FOREIGN KEY fk_production_item_demand_variant,
  DROP FOREIGN KEY fk_production_item_demand_basis,
  DROP INDEX uk_production_item_demand_group_variant,
  DROP INDEX uk_production_item_demand_basis_reference,
  DROP INDEX uk_production_item_demand_variant_reference,
  DROP COLUMN material_variant_code_snapshot,
  DROP COLUMN material_variant_id,
  DROP COLUMN requirement_basis_id;

DROP TABLE production_material_requirement_basis;
