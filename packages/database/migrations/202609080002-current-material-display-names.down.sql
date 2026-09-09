-- Historical names cannot be reconstructed from current names. Rollback requires empty affected tables.
CREATE TEMPORARY TABLE tmp_material_name_rollback_guard (
  must_be_zero TINYINT NOT NULL,
  CONSTRAINT chk_material_name_rollback_empty CHECK (must_be_zero = 0)
) ENGINE=MEMORY;
INSERT INTO tmp_material_name_rollback_guard (must_be_zero)
SELECT 1 WHERE EXISTS (SELECT 1 FROM production_material_requirement_basis)
  OR EXISTS (SELECT 1 FROM production_item_demand)
  OR EXISTS (SELECT 1 FROM item_batch)
  OR EXISTS (SELECT 1 FROM inbound_detail);
DROP TEMPORARY TABLE tmp_material_name_rollback_guard;

ALTER TABLE production_material_requirement_basis
  ADD COLUMN material_name_snapshot VARCHAR(200) NOT NULL AFTER material_code_snapshot;
ALTER TABLE production_item_demand
  ADD COLUMN item_name_snapshot VARCHAR(200) NOT NULL AFTER item_code_snapshot;
ALTER TABLE item_batch
  ADD COLUMN product_name_snapshot VARCHAR(200) NOT NULL AFTER material_variant_code_snapshot;
ALTER TABLE inbound_detail
  ADD COLUMN product_name_snapshot VARCHAR(200) NOT NULL AFTER item_code_snapshot;
