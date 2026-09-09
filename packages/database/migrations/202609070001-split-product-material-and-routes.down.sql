-- Reset-only rollback: independent routes have no recoverable product owner.
CREATE TEMPORARY TABLE tmp_split_product_material_down_guard (
  invalid_value TINYINT NOT NULL,
  CHECK (invalid_value = 0)
) ENGINE=MEMORY;

INSERT INTO tmp_split_product_material_down_guard (invalid_value)
SELECT 1 WHERE EXISTS (SELECT 1 FROM products) OR EXISTS (SELECT 1 FROM materials) OR EXISTS (SELECT 1 FROM process_routes) OR EXISTS (SELECT 1 FROM work_orders) OR EXISTS (SELECT 1 FROM material_variants);

DROP TEMPORARY TABLE tmp_split_product_material_down_guard;

ALTER TABLE process_routes
  DROP INDEX uk_process_routes_version,
  ADD COLUMN product_id BIGINT UNSIGNED NOT NULL AFTER route_name,
  ADD UNIQUE KEY uk_process_routes_version (product_id, route_code, version_no),
  ADD CONSTRAINT fk_process_routes_product FOREIGN KEY (product_id) REFERENCES products(id);

DROP TRIGGER trg_materials_reject_identity_update;
DROP TRIGGER trg_material_variants_reject_identity_update;
-- Detach and explicitly restore all affected composite foreign keys.
ALTER TABLE product_materials DROP FOREIGN KEY fk_product_materials_material;
ALTER TABLE material_variants DROP FOREIGN KEY fk_material_variants_material;
ALTER TABLE production_material_requirement_basis DROP FOREIGN KEY fk_material_requirement_basis_material;
ALTER TABLE production_material_requirement_basis DROP FOREIGN KEY fk_material_requirement_basis_bom;
ALTER TABLE production_item_demand DROP FOREIGN KEY fk_production_item_demand_material;
ALTER TABLE production_item_demand DROP FOREIGN KEY fk_production_item_demand_basis;
ALTER TABLE production_item_demand DROP FOREIGN KEY fk_production_item_demand_variant;
ALTER TABLE item_batch DROP FOREIGN KEY fk_item_batch_variant;
ALTER TABLE inbound_detail DROP FOREIGN KEY fk_inbound_detail_variant;
ALTER TABLE stock_check_detail DROP FOREIGN KEY fk_stock_check_detail_variant;
ALTER TABLE production_scrap_supplement_plan_line DROP FOREIGN KEY fk_scrap_supplement_plan_line_basis;
ALTER TABLE production_scrap_supplement_plan_line DROP FOREIGN KEY fk_scrap_supplement_plan_line_variant;
ALTER TABLE inventory_material_variant_balance DROP FOREIGN KEY fk_inventory_variant_balance_variant;
DROP TRIGGER trg_inventory_transaction_update_variant_balance;
DROP TRIGGER trg_inventory_transaction_cleanup_variant_balance;
DROP TRIGGER trg_item_batch_move_variant_balance;
ALTER TABLE product_materials RENAME COLUMN material_id TO material_product_id;
ALTER TABLE material_variants RENAME COLUMN material_id TO material_product_id;
ALTER TABLE production_material_requirement_basis RENAME COLUMN material_id TO material_product_id;
ALTER TABLE inventory_material_variant_balance RENAME COLUMN material_id TO material_product_id;
ALTER TABLE product_materials ADD CONSTRAINT fk_product_materials_material FOREIGN KEY (material_product_id) REFERENCES materials(id);
ALTER TABLE material_variants ADD CONSTRAINT fk_material_variants_material FOREIGN KEY (material_product_id) REFERENCES materials(id);
ALTER TABLE production_material_requirement_basis ADD CONSTRAINT fk_material_requirement_basis_material FOREIGN KEY (material_product_id) REFERENCES materials(id);
ALTER TABLE production_material_requirement_basis ADD CONSTRAINT fk_material_requirement_basis_bom FOREIGN KEY (product_material_id, material_product_id) REFERENCES product_materials(id, material_product_id);
ALTER TABLE production_item_demand ADD CONSTRAINT fk_production_item_demand_material FOREIGN KEY (product_material_id, item_id) REFERENCES product_materials(id, material_product_id);
ALTER TABLE production_item_demand ADD CONSTRAINT fk_production_item_demand_basis FOREIGN KEY (requirement_basis_id, production_batch_id, product_material_id, item_id) REFERENCES production_material_requirement_basis(id, production_batch_id, product_material_id, material_product_id);
ALTER TABLE production_item_demand ADD CONSTRAINT fk_production_item_demand_variant FOREIGN KEY (material_variant_id, item_id) REFERENCES material_variants(id, material_product_id);
ALTER TABLE item_batch ADD CONSTRAINT fk_item_batch_variant FOREIGN KEY (material_variant_id, item_id) REFERENCES material_variants(id, material_product_id);
ALTER TABLE inbound_detail ADD CONSTRAINT fk_inbound_detail_variant FOREIGN KEY (material_variant_id, item_id) REFERENCES material_variants(id, material_product_id);
ALTER TABLE stock_check_detail ADD CONSTRAINT fk_stock_check_detail_variant FOREIGN KEY (material_variant_id, item_id) REFERENCES material_variants(id, material_product_id);
ALTER TABLE production_scrap_supplement_plan_line ADD CONSTRAINT fk_scrap_supplement_plan_line_basis FOREIGN KEY (requirement_basis_id, production_batch_id, product_material_id, item_id) REFERENCES production_material_requirement_basis(id, production_batch_id, product_material_id, material_product_id);
ALTER TABLE production_scrap_supplement_plan_line ADD CONSTRAINT fk_scrap_supplement_plan_line_variant FOREIGN KEY (material_variant_id, item_id) REFERENCES material_variants(id, material_product_id);
ALTER TABLE inventory_material_variant_balance ADD CONSTRAINT fk_inventory_variant_balance_variant FOREIGN KEY (material_variant_id, material_product_id) REFERENCES material_variants(id, material_product_id);

CREATE TRIGGER trg_inventory_transaction_update_variant_balance
AFTER INSERT ON inventory_transaction
FOR EACH ROW
BEGIN
  DECLARE current_batch_status VARCHAR(20);
  SELECT batch_status INTO current_batch_status
  FROM item_batch
  WHERE id = NEW.batch_id;

  INSERT INTO inventory_material_variant_balance (
    material_variant_id,
    material_product_id,
    stock_status,
    batch_status,
    current_quantity
  ) VALUES (
    NEW.material_variant_id,
    NEW.item_id,
    NEW.stock_status,
    current_batch_status,
    CAST(NEW.quantity AS SIGNED)
  )
  ON DUPLICATE KEY UPDATE
    current_quantity = current_quantity + VALUES(current_quantity),
    version = version + 1;
END;

CREATE TRIGGER trg_inventory_transaction_cleanup_variant_balance
AFTER DELETE ON inventory_transaction
FOR EACH ROW
BEGIN
  DECLARE current_batch_status VARCHAR(20);
  SELECT batch_status INTO current_batch_status
  FROM item_batch
  WHERE id = OLD.batch_id;

  UPDATE inventory_material_variant_balance
  SET current_quantity = current_quantity - CAST(OLD.quantity AS SIGNED),
      version = version + 1
  WHERE material_variant_id = OLD.material_variant_id
    AND stock_status = OLD.stock_status
    AND batch_status = current_batch_status;

  DELETE FROM inventory_material_variant_balance
  WHERE material_variant_id = OLD.material_variant_id
    AND stock_status = OLD.stock_status
    AND batch_status = current_batch_status
    AND current_quantity = 0;
END;

CREATE TRIGGER trg_item_batch_move_variant_balance
AFTER UPDATE ON item_batch
FOR EACH ROW
BEGIN
  IF OLD.batch_status <> NEW.batch_status THEN
    INSERT INTO inventory_material_variant_balance (
      material_variant_id,
      material_product_id,
      stock_status,
      batch_status,
      current_quantity
    )
    SELECT
      NEW.material_variant_id,
      NEW.item_id,
      stock_status,
      NEW.batch_status,
      current_quantity
    FROM inventory_batch_balance
    WHERE batch_id = NEW.id
    ON DUPLICATE KEY UPDATE
      current_quantity = inventory_material_variant_balance.current_quantity
        + VALUES(current_quantity),
      version = inventory_material_variant_balance.version + 1;

    UPDATE inventory_material_variant_balance variant_balance
    JOIN inventory_batch_balance batch_balance
      ON batch_balance.stock_status = variant_balance.stock_status
      AND batch_balance.batch_id = OLD.id
    SET variant_balance.current_quantity = variant_balance.current_quantity
          - batch_balance.current_quantity,
        variant_balance.version = variant_balance.version + 1
    WHERE variant_balance.material_variant_id = OLD.material_variant_id
      AND variant_balance.batch_status = OLD.batch_status;

    DELETE FROM inventory_material_variant_balance
    WHERE material_variant_id = OLD.material_variant_id
      AND batch_status = OLD.batch_status
      AND current_quantity = 0;
  END IF;
END;

CREATE TRIGGER trg_material_variants_reject_identity_update
BEFORE UPDATE ON material_variants
FOR EACH ROW
BEGIN
  IF NOT (NEW.material_product_id <=> OLD.material_product_id)
    OR NOT (NEW.major_version <=> OLD.major_version)
    OR NOT (NEW.minor_version <=> OLD.minor_version)
    OR NOT (NEW.variant_code <=> OLD.variant_code) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'material variant identity is immutable';
  END IF;
END;

ALTER TABLE product_materials DROP FOREIGN KEY fk_product_materials_material;
ALTER TABLE product_materials
  ADD CONSTRAINT fk_product_materials_material FOREIGN KEY (material_product_id) REFERENCES products(id);

ALTER TABLE material_variants DROP FOREIGN KEY fk_material_variants_material;
ALTER TABLE material_variants
  ADD CONSTRAINT fk_material_variants_material FOREIGN KEY (material_product_id) REFERENCES products(id);

ALTER TABLE production_material_requirement_basis DROP FOREIGN KEY fk_material_requirement_basis_material;
ALTER TABLE production_material_requirement_basis
  ADD CONSTRAINT fk_material_requirement_basis_material FOREIGN KEY (material_product_id) REFERENCES products(id);

ALTER TABLE production_item_demand DROP FOREIGN KEY fk_production_item_demand_item;
ALTER TABLE production_item_demand
  ADD CONSTRAINT fk_production_item_demand_item FOREIGN KEY (item_id) REFERENCES products(id);

ALTER TABLE item_batch DROP FOREIGN KEY fk_item_batch_item;
ALTER TABLE item_batch
  ADD CONSTRAINT fk_item_batch_item FOREIGN KEY (item_id) REFERENCES products(id);

ALTER TABLE inventory_transaction DROP FOREIGN KEY fk_inventory_transaction_item;
ALTER TABLE inventory_transaction
  ADD CONSTRAINT fk_inventory_transaction_item FOREIGN KEY (item_id) REFERENCES products(id);

ALTER TABLE inbound_detail DROP FOREIGN KEY fk_inbound_detail_item;
ALTER TABLE inbound_detail
  ADD CONSTRAINT fk_inbound_detail_item FOREIGN KEY (item_id) REFERENCES products(id);

ALTER TABLE stock_check_detail DROP FOREIGN KEY fk_stock_check_detail_item;
ALTER TABLE stock_check_detail
  ADD CONSTRAINT fk_stock_check_detail_item FOREIGN KEY (item_id) REFERENCES products(id);

ALTER TABLE inventory_item_balance DROP FOREIGN KEY fk_inventory_item_balance_item;
ALTER TABLE inventory_item_balance
  ADD CONSTRAINT fk_inventory_item_balance_item FOREIGN KEY (item_id) REFERENCES products(id);

ALTER TABLE product_materials
  ADD CONSTRAINT chk_product_materials_self CHECK (product_id <> material_product_id);

DROP TABLE materials;
