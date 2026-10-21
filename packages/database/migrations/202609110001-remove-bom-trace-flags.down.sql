-- Deleted flags cannot be reconstructed. Reject populated tables before any DDL.
CREATE TEMPORARY TABLE tmp_bom_flags_rollback_guard (
  must_be_zero TINYINT NOT NULL,
  CONSTRAINT chk_bom_flags_rollback_empty CHECK (must_be_zero = 0)
) ENGINE=MEMORY;
INSERT INTO tmp_bom_flags_rollback_guard (must_be_zero)
SELECT 1 WHERE EXISTS (SELECT 1 FROM product_materials)
  OR EXISTS (SELECT 1 FROM production_material_requirement_basis)
  OR EXISTS (SELECT 1 FROM production_item_demand);
DROP TEMPORARY TABLE tmp_bom_flags_rollback_guard;

ALTER TABLE product_materials
  DROP CHECK chk_product_materials_flags,
  ADD COLUMN is_key_material TINYINT NOT NULL DEFAULT 1 AFTER unit,
  ADD COLUMN need_batch_record TINYINT NOT NULL DEFAULT 1 AFTER is_key_material,
  ADD CONSTRAINT chk_product_materials_flags CHECK (
    is_key_material IN (0, 1) AND need_batch_record IN (0, 1)
    AND status IN (0, 1) AND is_deleted IN (0, 1)
  );

ALTER TABLE production_material_requirement_basis
  ADD COLUMN is_key_material_snapshot TINYINT NOT NULL,
  ADD COLUMN need_batch_record_snapshot TINYINT NOT NULL,
  ADD CONSTRAINT chk_material_requirement_basis_flags CHECK (
    is_key_material_snapshot IN (0, 1) AND need_batch_record_snapshot IN (0, 1)
  );

ALTER TABLE production_item_demand
  ADD COLUMN is_key_material_snapshot TINYINT NOT NULL,
  ADD COLUMN need_batch_record_snapshot TINYINT NOT NULL,
  ADD CONSTRAINT chk_production_item_demand_flags CHECK (
    is_key_material_snapshot IN (0, 1) AND need_batch_record_snapshot IN (0, 1)
  );
