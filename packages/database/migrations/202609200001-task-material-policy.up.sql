-- Production task material policy. Rebuild development business data before switching.
CREATE TEMPORARY TABLE tmp_task_material_policy_guard (invalid_value TINYINT NOT NULL CHECK (invalid_value=0)) ENGINE=MEMORY;
INSERT INTO tmp_task_material_policy_guard SELECT 1 WHERE EXISTS (SELECT 1 FROM production_batches) OR EXISTS (SELECT 1 FROM work_order_material_versions);
DROP TEMPORARY TABLE tmp_task_material_policy_guard;

DROP TRIGGER trg_work_order_material_versions_guard_insert;
DROP TRIGGER trg_work_order_material_versions_guard_update;
DROP TRIGGER trg_work_order_material_versions_reject_delete;
DROP TABLE work_order_material_versions;

ALTER TABLE production_material_requirement_basis
  ADD COLUMN locked_material_variant_id BIGINT UNSIGNED NOT NULL AFTER material_id,
  ADD COLUMN supplier_hint VARCHAR(500) NULL AFTER locked_material_variant_id,
  ADD UNIQUE KEY uk_requirement_basis_batch_material (production_batch_id,material_id),
  ADD UNIQUE KEY uk_requirement_basis_locked_reference (id,production_batch_id,product_material_id,material_id,locked_material_variant_id),
  ADD CONSTRAINT fk_requirement_basis_locked_variant FOREIGN KEY (locked_material_variant_id,material_id) REFERENCES material_variants(id,material_id);

ALTER TABLE production_scrap_supplement_plan_line DROP FOREIGN KEY fk_scrap_supplement_plan_line_basis_demand;
ALTER TABLE production_item_demand
  DROP FOREIGN KEY fk_production_item_demand_basis,
  DROP INDEX fk_production_item_demand_basis,
  DROP FOREIGN KEY fk_production_item_demand_material,
  DROP CHECK chk_production_item_demand_quantity,
  DROP INDEX uk_production_item_demand_group_variant;

ALTER TABLE production_item_demand
  MODIFY COLUMN requirement_basis_id BIGINT UNSIGNED NULL,
  MODIFY COLUMN product_material_id BIGINT UNSIGNED NULL,
  MODIFY COLUMN quantity_per_unit_snapshot INT NULL,
  MODIFY COLUMN planned_output_quantity_snapshot INT NULL,
  ADD COLUMN supplier_hint VARCHAR(500) NULL AFTER material_variant_code_snapshot,
  ADD UNIQUE KEY uk_production_item_demand_group_variant (generation_group_key,item_id,material_variant_id),
  ADD CONSTRAINT fk_production_item_demand_material FOREIGN KEY (product_material_id,item_id) REFERENCES product_materials(id,material_id),
  ADD CONSTRAINT fk_production_item_demand_basis FOREIGN KEY (requirement_basis_id,production_batch_id,product_material_id,item_id,material_variant_id)
    REFERENCES production_material_requirement_basis(id,production_batch_id,product_material_id,material_id,locked_material_variant_id),
  ADD CONSTRAINT chk_production_item_demand_quantity CHECK (need_number>0),
  ADD CONSTRAINT chk_demand_bom_source CHECK (
    (requirement_basis_id IS NOT NULL AND product_material_id IS NOT NULL AND quantity_per_unit_snapshot IS NOT NULL AND planned_output_quantity_snapshot IS NOT NULL
     AND quantity_per_unit_snapshot>0 AND planned_output_quantity_snapshot>0 AND supplier_hint IS NULL)
    OR (requirement_basis_id IS NULL AND product_material_id IS NULL AND quantity_per_unit_snapshot IS NULL AND planned_output_quantity_snapshot IS NULL
        AND demand_type='manual_additional')
  );
ALTER TABLE production_scrap_supplement_plan_line
  ADD CONSTRAINT fk_scrap_supplement_plan_line_basis_demand FOREIGN KEY (original_demand_id,production_batch_id,requirement_basis_id)
    REFERENCES production_item_demand(id,production_batch_id,requirement_basis_id);

CREATE TRIGGER trg_requirement_basis_mass_insert BEFORE INSERT ON production_material_requirement_basis FOR EACH ROW
BEGIN
  DECLARE order_kind VARCHAR(30);
  SELECT w.order_type INTO order_kind FROM production_batches b JOIN work_orders w ON w.id=b.work_order_id WHERE b.id=NEW.production_batch_id;
  IF order_kind IS NULL OR order_kind<>'mass_production' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='BOM basis is only available for mass production tasks';
  END IF;
END;
CREATE TRIGGER trg_requirement_basis_immutable_update BEFORE UPDATE ON production_material_requirement_basis FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='confirmed task material basis is immutable';
END;
CREATE TRIGGER trg_requirement_basis_immutable_delete BEFORE DELETE ON production_material_requirement_basis FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='confirmed task material basis is immutable';
END;
CREATE TRIGGER trg_demand_task_policy_insert BEFORE INSERT ON production_item_demand FOR EACH ROW
BEGIN
  DECLARE order_kind VARCHAR(30);
  SELECT w.order_type INTO order_kind FROM production_batches b JOIN work_orders w ON w.id=b.work_order_id WHERE b.id=NEW.production_batch_id;
  IF order_kind IS NULL OR (order_kind='mass_production' AND NEW.requirement_basis_id IS NULL)
    OR (order_kind='research' AND NEW.requirement_basis_id IS NOT NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='demand BOM source must match task order type';
  END IF;
END;
CREATE TRIGGER trg_demand_material_facts_update BEFORE UPDATE ON production_item_demand FOR EACH ROW
BEGIN
  IF NEW.production_batch_id<>OLD.production_batch_id OR NOT (NEW.requirement_basis_id<=>OLD.requirement_basis_id)
    OR NOT (NEW.product_material_id<=>OLD.product_material_id) OR NEW.item_id<>OLD.item_id OR NEW.material_variant_id<>OLD.material_variant_id
    OR NOT (NEW.quantity_per_unit_snapshot<=>OLD.quantity_per_unit_snapshot) OR NOT (NEW.planned_output_quantity_snapshot<=>OLD.planned_output_quantity_snapshot)
    OR NEW.unit_snapshot<>OLD.unit_snapshot OR NEW.need_number<>OLD.need_number OR NOT (NEW.supplier_hint<=>OLD.supplier_hint) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='confirmed demand material and quantity facts are immutable';
  END IF;
END;
