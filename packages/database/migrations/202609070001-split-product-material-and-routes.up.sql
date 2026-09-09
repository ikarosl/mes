-- Product owns materials, products, material_variants and independent routes.
-- Development reset is supported. Run against an empty business database: existing
-- production order types and route ownership cannot be inferred safely.
CREATE TEMPORARY TABLE tmp_split_product_material_up_guard (
  invalid_value TINYINT NOT NULL,
  CHECK (invalid_value = 0)
) ENGINE=MEMORY;

INSERT INTO tmp_split_product_material_up_guard (invalid_value)
SELECT 1 WHERE EXISTS (SELECT 1 FROM products) OR EXISTS (SELECT 1 FROM process_routes) OR EXISTS (SELECT 1 FROM work_orders) OR EXISTS (SELECT 1 FROM material_variants);

DROP TEMPORARY TABLE tmp_split_product_material_up_guard;

CREATE TABLE materials (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  material_code VARCHAR(100) NOT NULL,
  material_name VARCHAR(200) NOT NULL,
  category_id BIGINT UNSIGNED NOT NULL,
  unit VARCHAR(20) NOT NULL,
  acquire_method VARCHAR(32) NOT NULL,
  spec_values JSON NULL,
  status TINYINT NOT NULL DEFAULT 1,
  remark TEXT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_deleted TINYINT NOT NULL DEFAULT 0,
  deleted_by BIGINT UNSIGNED NULL,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_materials_code (material_code),
  KEY idx_materials_category (category_id),
  CONSTRAINT chk_materials_acquire CHECK (acquire_method IN ('self_made', 'outsourced', 'purchased')),
  CONSTRAINT chk_materials_status CHECK (status IN (0, 1)),
  CONSTRAINT chk_materials_deleted CHECK (is_deleted IN (0, 1)),
  CONSTRAINT chk_materials_delete_facts CHECK (
    (is_deleted = 0 AND deleted_by IS NULL AND deleted_at IS NULL)
    OR (is_deleted = 1 AND deleted_by IS NOT NULL AND deleted_at IS NOT NULL)
  ),
  CONSTRAINT fk_materials_category FOREIGN KEY (category_id) REFERENCES product_categories(id),
  CONSTRAINT fk_materials_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_materials_updated_by FOREIGN KEY (updated_by) REFERENCES users(id),
  CONSTRAINT fk_materials_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- These IDs now belong to separate identity spaces, so equal numeric IDs are valid.
ALTER TABLE product_materials DROP CHECK chk_product_materials_self;

-- Detach every constraint that points at the old product identity column before
-- renaming it. The direct item constraints are detached in the same pass so the
-- logistics tables can be moved to the materials identity space atomically.
ALTER TABLE product_materials DROP FOREIGN KEY fk_product_materials_material;
ALTER TABLE material_variants DROP FOREIGN KEY fk_material_variants_material;
ALTER TABLE production_material_requirement_basis DROP FOREIGN KEY fk_material_requirement_basis_material;
ALTER TABLE production_material_requirement_basis DROP FOREIGN KEY fk_material_requirement_basis_bom;
ALTER TABLE production_item_demand DROP FOREIGN KEY fk_production_item_demand_material;
ALTER TABLE production_item_demand DROP FOREIGN KEY fk_production_item_demand_basis;
ALTER TABLE production_item_demand DROP FOREIGN KEY fk_production_item_demand_variant;
ALTER TABLE production_item_demand DROP FOREIGN KEY fk_production_item_demand_item;
ALTER TABLE item_batch DROP FOREIGN KEY fk_item_batch_variant;
ALTER TABLE item_batch DROP FOREIGN KEY fk_item_batch_item;
ALTER TABLE inbound_detail DROP FOREIGN KEY fk_inbound_detail_variant;
ALTER TABLE inbound_detail DROP FOREIGN KEY fk_inbound_detail_item;
ALTER TABLE stock_check_detail DROP FOREIGN KEY fk_stock_check_detail_variant;
ALTER TABLE stock_check_detail DROP FOREIGN KEY fk_stock_check_detail_item;
ALTER TABLE production_scrap_supplement_plan_line DROP FOREIGN KEY fk_scrap_supplement_plan_line_basis;
ALTER TABLE production_scrap_supplement_plan_line DROP FOREIGN KEY fk_scrap_supplement_plan_line_variant;
ALTER TABLE inventory_material_variant_balance DROP FOREIGN KEY fk_inventory_variant_balance_variant;
ALTER TABLE inventory_transaction DROP FOREIGN KEY fk_inventory_transaction_item;
ALTER TABLE inventory_item_balance DROP FOREIGN KEY fk_inventory_item_balance_item;
DROP TRIGGER trg_inventory_transaction_update_variant_balance;
DROP TRIGGER trg_inventory_transaction_cleanup_variant_balance;
DROP TRIGGER trg_item_batch_move_variant_balance;
DROP TRIGGER trg_material_variants_reject_identity_update;
ALTER TABLE product_materials RENAME COLUMN material_product_id TO material_id;
ALTER TABLE material_variants RENAME COLUMN material_product_id TO material_id;
ALTER TABLE production_material_requirement_basis RENAME COLUMN material_product_id TO material_id;
ALTER TABLE inventory_material_variant_balance RENAME COLUMN material_product_id TO material_id;
ALTER TABLE product_materials ADD CONSTRAINT fk_product_materials_material FOREIGN KEY (material_id) REFERENCES materials(id);
ALTER TABLE material_variants ADD CONSTRAINT fk_material_variants_material FOREIGN KEY (material_id) REFERENCES materials(id);
ALTER TABLE production_material_requirement_basis ADD CONSTRAINT fk_material_requirement_basis_material FOREIGN KEY (material_id) REFERENCES materials(id);
ALTER TABLE production_material_requirement_basis ADD CONSTRAINT fk_material_requirement_basis_bom FOREIGN KEY (product_material_id, material_id) REFERENCES product_materials(id, material_id);
ALTER TABLE production_item_demand ADD CONSTRAINT fk_production_item_demand_material FOREIGN KEY (product_material_id, item_id) REFERENCES product_materials(id, material_id);
ALTER TABLE production_item_demand ADD CONSTRAINT fk_production_item_demand_basis FOREIGN KEY (requirement_basis_id, production_batch_id, product_material_id, item_id) REFERENCES production_material_requirement_basis(id, production_batch_id, product_material_id, material_id);
ALTER TABLE production_item_demand ADD CONSTRAINT fk_production_item_demand_variant FOREIGN KEY (material_variant_id, item_id) REFERENCES material_variants(id, material_id);
ALTER TABLE production_item_demand ADD CONSTRAINT fk_production_item_demand_item FOREIGN KEY (item_id) REFERENCES materials(id);
ALTER TABLE item_batch ADD CONSTRAINT fk_item_batch_variant FOREIGN KEY (material_variant_id, item_id) REFERENCES material_variants(id, material_id);
ALTER TABLE item_batch ADD CONSTRAINT fk_item_batch_item FOREIGN KEY (item_id) REFERENCES materials(id);
ALTER TABLE inbound_detail ADD CONSTRAINT fk_inbound_detail_variant FOREIGN KEY (material_variant_id, item_id) REFERENCES material_variants(id, material_id);
ALTER TABLE inbound_detail ADD CONSTRAINT fk_inbound_detail_item FOREIGN KEY (item_id) REFERENCES materials(id);
ALTER TABLE stock_check_detail ADD CONSTRAINT fk_stock_check_detail_variant FOREIGN KEY (material_variant_id, item_id) REFERENCES material_variants(id, material_id);
ALTER TABLE stock_check_detail ADD CONSTRAINT fk_stock_check_detail_item FOREIGN KEY (item_id) REFERENCES materials(id);
ALTER TABLE production_scrap_supplement_plan_line ADD CONSTRAINT fk_scrap_supplement_plan_line_basis FOREIGN KEY (requirement_basis_id, production_batch_id, product_material_id, item_id) REFERENCES production_material_requirement_basis(id, production_batch_id, product_material_id, material_id);
ALTER TABLE production_scrap_supplement_plan_line ADD CONSTRAINT fk_scrap_supplement_plan_line_variant FOREIGN KEY (material_variant_id, item_id) REFERENCES material_variants(id, material_id);
ALTER TABLE inventory_material_variant_balance ADD CONSTRAINT fk_inventory_variant_balance_variant FOREIGN KEY (material_variant_id, material_id) REFERENCES material_variants(id, material_id);
ALTER TABLE inventory_transaction ADD CONSTRAINT fk_inventory_transaction_item FOREIGN KEY (item_id) REFERENCES materials(id);
ALTER TABLE inventory_item_balance ADD CONSTRAINT fk_inventory_item_balance_item FOREIGN KEY (item_id) REFERENCES materials(id);

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
    material_id,
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
      material_id,
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
  IF NOT (NEW.material_id <=> OLD.material_id)
    OR NOT (NEW.major_version <=> OLD.major_version)
    OR NOT (NEW.minor_version <=> OLD.minor_version)
    OR NOT (NEW.variant_code <=> OLD.variant_code) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'material variant identity is immutable';
  END IF;
END;

CREATE TRIGGER trg_materials_reject_identity_update
BEFORE UPDATE ON materials
FOR EACH ROW
BEGIN
  IF NOT (NEW.material_code <=> OLD.material_code) OR NOT (NEW.unit <=> OLD.unit) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'material code and unit are immutable';
  END IF;
END;

-- No product-route eligibility table: default_route_id is a form-fill convenience.
ALTER TABLE process_routes
  DROP FOREIGN KEY fk_process_routes_product,
  DROP INDEX uk_process_routes_version,
  DROP COLUMN product_id,
  ADD UNIQUE KEY uk_process_routes_version (route_code, version_no);
