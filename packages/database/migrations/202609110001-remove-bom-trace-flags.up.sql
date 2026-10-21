-- Deploy with Product/Production writes paused; these flags no longer control business behavior.
ALTER TABLE product_materials
  DROP CHECK chk_product_materials_flags,
  DROP COLUMN is_key_material,
  DROP COLUMN need_batch_record,
  ADD CONSTRAINT chk_product_materials_flags CHECK (status IN (0, 1) AND is_deleted IN (0, 1));

ALTER TABLE production_material_requirement_basis
  DROP CHECK chk_material_requirement_basis_flags,
  DROP COLUMN is_key_material_snapshot,
  DROP COLUMN need_batch_record_snapshot;

ALTER TABLE production_item_demand
  DROP CHECK chk_production_item_demand_flags,
  DROP COLUMN is_key_material_snapshot,
  DROP COLUMN need_batch_record_snapshot;
