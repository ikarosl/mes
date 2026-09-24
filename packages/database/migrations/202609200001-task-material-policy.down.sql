-- The prior work-order configuration cannot be reconstructed from task choices.
CREATE TEMPORARY TABLE tmp_task_material_policy_down_guard (invalid_value TINYINT NOT NULL CHECK (invalid_value=0)) ENGINE=MEMORY;
INSERT INTO tmp_task_material_policy_down_guard SELECT 1 WHERE EXISTS (SELECT 1 FROM production_batches);
DROP TEMPORARY TABLE tmp_task_material_policy_down_guard;
DROP TRIGGER trg_demand_material_facts_update;
DROP TRIGGER trg_demand_task_policy_insert;
DROP TRIGGER trg_requirement_basis_immutable_delete;
DROP TRIGGER trg_requirement_basis_immutable_update;
DROP TRIGGER trg_requirement_basis_mass_insert;
ALTER TABLE production_scrap_supplement_plan_line DROP FOREIGN KEY fk_scrap_supplement_plan_line_basis_demand;
ALTER TABLE production_item_demand
  DROP FOREIGN KEY fk_production_item_demand_basis,
  DROP FOREIGN KEY fk_production_item_demand_material,
  DROP INDEX fk_production_item_demand_basis,
  DROP CHECK chk_demand_bom_source,
  DROP CHECK chk_production_item_demand_quantity,
  DROP INDEX uk_production_item_demand_group_variant,
  DROP COLUMN supplier_hint;

ALTER TABLE production_item_demand
  MODIFY COLUMN requirement_basis_id BIGINT UNSIGNED NOT NULL,
  MODIFY COLUMN product_material_id BIGINT UNSIGNED NOT NULL,
  MODIFY COLUMN quantity_per_unit_snapshot INT NOT NULL,
  MODIFY COLUMN planned_output_quantity_snapshot INT NOT NULL,
  ADD UNIQUE KEY uk_production_item_demand_group_variant (generation_group_key,requirement_basis_id,material_variant_id),
  ADD CONSTRAINT fk_production_item_demand_material FOREIGN KEY (product_material_id,item_id) REFERENCES product_materials(id,material_id),
  ADD CONSTRAINT fk_production_item_demand_basis FOREIGN KEY (requirement_basis_id,production_batch_id,product_material_id,item_id)
    REFERENCES production_material_requirement_basis(id,production_batch_id,product_material_id,material_id),
  ADD CONSTRAINT chk_production_item_demand_quantity CHECK (quantity_per_unit_snapshot>0 AND planned_output_quantity_snapshot>0 AND need_number>0);
ALTER TABLE production_scrap_supplement_plan_line
  ADD CONSTRAINT fk_scrap_supplement_plan_line_basis_demand FOREIGN KEY (original_demand_id,production_batch_id,requirement_basis_id)
    REFERENCES production_item_demand(id,production_batch_id,requirement_basis_id);
ALTER TABLE production_material_requirement_basis
  DROP FOREIGN KEY fk_requirement_basis_locked_variant,
  DROP INDEX fk_requirement_basis_locked_variant,
  DROP INDEX uk_requirement_basis_batch_material,
  DROP INDEX uk_requirement_basis_locked_reference,
  DROP COLUMN supplier_hint,
  DROP COLUMN locked_material_variant_id;
CREATE TABLE work_order_material_versions (
  work_order_id BIGINT UNSIGNED NOT NULL,
  material_id BIGINT UNSIGNED NOT NULL,
  material_variant_id BIGINT UNSIGNED NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  version INT NOT NULL DEFAULT 0,
  PRIMARY KEY (work_order_id,material_id),
  CONSTRAINT fk_work_order_material_versions_order FOREIGN KEY(work_order_id) REFERENCES work_orders(id),
  CONSTRAINT fk_work_order_material_versions_variant FOREIGN KEY(material_variant_id,material_id) REFERENCES material_variants(id,material_id),
  CONSTRAINT fk_work_order_material_versions_actor FOREIGN KEY(created_by) REFERENCES users(id),
  CONSTRAINT fk_work_order_material_versions_updater FOREIGN KEY(updated_by) REFERENCES users(id),
  CONSTRAINT chk_work_order_material_versions_version CHECK(version>=0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TRIGGER trg_work_order_material_versions_guard_insert
BEFORE INSERT ON work_order_material_versions
FOR EACH ROW
BEGIN
  DECLARE order_kind VARCHAR(30);
  DECLARE order_status VARCHAR(30);
  DECLARE in_use BOOLEAN DEFAULT FALSE;
  SELECT order_type,status INTO order_kind,order_status
    FROM work_orders WHERE id=NEW.work_order_id FOR UPDATE;
  IF order_kind <> 'mass_production' OR order_status NOT IN ('released','doing') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'material configuration requires an open mass production order';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM production_batches b JOIN production_item_demand d ON d.production_batch_id=b.id
    WHERE b.work_order_id=NEW.work_order_id AND b.status NOT IN ('cancelled','terminated')
    LIMIT 1 FOR SHARE
  ) INTO in_use;
  IF in_use THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'work order material configuration is referenced by a production task';
  END IF;
END;

CREATE TRIGGER trg_work_order_material_versions_guard_update
BEFORE UPDATE ON work_order_material_versions
FOR EACH ROW
BEGIN
  DECLARE order_kind VARCHAR(30);
  DECLARE order_status VARCHAR(30);
  DECLARE in_use BOOLEAN DEFAULT FALSE;
  SELECT order_type,status INTO order_kind,order_status
    FROM work_orders WHERE id=NEW.work_order_id FOR UPDATE;
  IF order_kind <> 'mass_production' OR order_status NOT IN ('released','doing') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'material configuration requires an open mass production order';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM production_batches b JOIN production_item_demand d ON d.production_batch_id=b.id
    WHERE b.work_order_id=NEW.work_order_id AND b.status NOT IN ('cancelled','terminated')
    LIMIT 1 FOR SHARE
  ) INTO in_use;
  IF in_use THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'work order material configuration is referenced by a production task';
  END IF;
  IF NEW.work_order_id <> OLD.work_order_id OR NEW.material_id <> OLD.material_id
    OR NEW.created_by <> OLD.created_by OR NEW.created_at <> OLD.created_at THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'material configuration identity and creation audit cannot change';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'material configuration update must advance its version';
  END IF;
END;
CREATE TRIGGER trg_work_order_material_versions_reject_delete
BEFORE DELETE ON work_order_material_versions
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'mass production material choice is immutable';
END;

