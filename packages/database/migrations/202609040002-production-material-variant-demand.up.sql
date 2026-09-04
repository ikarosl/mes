-- Production architecture boundary:
-- - production_material_requirement_basis freezes one base-material BOM formula for
--   one production batch. It is the denominator for version splits, not an executable
--   demand and never replaces production_item_demand as the demand fact source.
-- - production_item_demand is always an administrator-confirmed quantity for one
--   exact material variant. Normal demand creation is atomic per requirement basis;
--   application code must enforce SUM(normal split quantities) = required_number.
-- - manual additions remain production_item_demand facts and point to an immutable
--   action header plus a parent demand. The selected variant may differ from the
--   parent because all enabled variants below a base material are interchangeable.
-- - inventory_transaction remains the only inventory fact. The new variant balance
--   is a rebuildable projection; inventory_item_balance remains the base-code rollup.

CREATE TABLE production_material_requirement_basis (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  production_batch_id BIGINT UNSIGNED NOT NULL,
  product_material_id BIGINT UNSIGNED NOT NULL,
  material_product_id BIGINT UNSIGNED NOT NULL,
  material_code_snapshot VARCHAR(100) NOT NULL,
  material_name_snapshot VARCHAR(200) NOT NULL,
  unit_snapshot VARCHAR(20) NOT NULL,
  quantity_per_unit_snapshot DECIMAL(12,4) NOT NULL,
  is_key_material_snapshot TINYINT NOT NULL,
  need_batch_record_snapshot TINYINT NOT NULL,
  planned_output_quantity_snapshot DECIMAL(12,4) NOT NULL,
  required_number DECIMAL(12,4) NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_material_requirement_basis_batch_bom (
    production_batch_id,
    product_material_id
  ),
  UNIQUE KEY uk_material_requirement_basis_reference (
    id,
    production_batch_id,
    product_material_id,
    material_product_id
  ),
  KEY idx_material_requirement_basis_material (
    material_product_id,
    production_batch_id,
    id
  ),
  CONSTRAINT chk_material_requirement_basis_quantity CHECK (
    quantity_per_unit_snapshot > 0
    AND planned_output_quantity_snapshot > 0
    AND required_number > 0
  ),
  CONSTRAINT chk_material_requirement_basis_integer CHECK (
    quantity_per_unit_snapshot = TRUNCATE(quantity_per_unit_snapshot, 0)
    AND planned_output_quantity_snapshot = TRUNCATE(planned_output_quantity_snapshot, 0)
    AND required_number = TRUNCATE(required_number, 0)
  ),
  CONSTRAINT chk_material_requirement_basis_flags CHECK (
    is_key_material_snapshot IN (0, 1)
    AND need_batch_record_snapshot IN (0, 1)
  ),
  CONSTRAINT fk_material_requirement_basis_batch FOREIGN KEY (production_batch_id)
    REFERENCES production_batches(id),
  CONSTRAINT fk_material_requirement_basis_bom FOREIGN KEY (
    product_material_id,
    material_product_id
  ) REFERENCES product_materials(id, material_product_id),
  CONSTRAINT fk_material_requirement_basis_material FOREIGN KEY (material_product_id)
    REFERENCES products(id),
  CONSTRAINT fk_material_requirement_basis_created_by FOREIGN KEY (created_by)
    REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE production_item_demand
  ADD COLUMN requirement_basis_id BIGINT UNSIGNED NOT NULL AFTER production_batch_id,
  ADD COLUMN material_variant_id BIGINT UNSIGNED NOT NULL AFTER item_id,
  ADD COLUMN material_variant_code_snapshot VARCHAR(180) NOT NULL
    AFTER item_name_snapshot,
  ADD UNIQUE KEY uk_production_item_demand_variant_reference (
    id,
    item_id,
    material_variant_id
  ),
  ADD UNIQUE KEY uk_production_item_demand_basis_reference (
    id,
    production_batch_id,
    requirement_basis_id
  ),
  ADD UNIQUE KEY uk_production_item_demand_group_variant (
    generation_group_key,
    requirement_basis_id,
    material_variant_id
  ),
  ADD CONSTRAINT fk_production_item_demand_basis FOREIGN KEY (
    requirement_basis_id,
    production_batch_id,
    product_material_id,
    item_id
  ) REFERENCES production_material_requirement_basis (
    id,
    production_batch_id,
    product_material_id,
    material_product_id
  ),
  ADD CONSTRAINT fk_production_item_demand_variant FOREIGN KEY (
    material_variant_id,
    item_id
  ) REFERENCES material_variants(id, material_product_id);

CREATE TABLE production_manual_demand_addition (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  addition_no VARCHAR(100) NOT NULL,
  production_batch_id BIGINT UNSIGNED NOT NULL,
  requirement_basis_id BIGINT UNSIGNED NOT NULL,
  parent_demand_id BIGINT UNSIGNED NOT NULL,
  reason TEXT NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_production_manual_demand_addition_no (addition_no),
  UNIQUE KEY uk_production_manual_demand_addition_reference (
    id,
    parent_demand_id,
    requirement_basis_id,
    production_batch_id
  ),
  KEY idx_manual_demand_addition_batch_created (
    production_batch_id,
    created_at,
    id
  ),
  CONSTRAINT chk_production_manual_demand_addition_reason CHECK (
    CHAR_LENGTH(TRIM(reason)) > 0
  ),
  CONSTRAINT fk_manual_demand_addition_parent FOREIGN KEY (
    parent_demand_id,
    production_batch_id,
    requirement_basis_id
  ) REFERENCES production_item_demand(id, production_batch_id, requirement_basis_id),
  CONSTRAINT fk_manual_demand_addition_batch FOREIGN KEY (production_batch_id)
    REFERENCES production_batches(id),
  CONSTRAINT fk_manual_demand_addition_created_by FOREIGN KEY (created_by)
    REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE production_item_demand
  DROP CHECK chk_production_item_demand_source,
  ADD COLUMN manual_addition_id BIGINT UNSIGNED NULL AFTER parent_demand_id,
  ADD KEY idx_production_item_demand_manual_addition (manual_addition_id),
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

-- A stock batch has one immutable exact variant. The base item remains denormalized
-- on logistics facts to support BOM/base-code aggregation and composite integrity.
ALTER TABLE item_batch
  DROP INDEX uk_item_batch_item_code,
  ADD COLUMN material_variant_id BIGINT UNSIGNED NOT NULL AFTER item_id,
  ADD COLUMN material_variant_code_snapshot VARCHAR(180) NOT NULL
    AFTER item_code_snapshot,
  ADD UNIQUE KEY uk_item_batch_variant_code (material_variant_id, batch_code),
  ADD UNIQUE KEY uk_item_batch_id_item_variant (id, item_id, material_variant_id),
  ADD CONSTRAINT fk_item_batch_variant FOREIGN KEY (material_variant_id, item_id)
    REFERENCES material_variants(id, material_product_id);

CREATE TRIGGER trg_item_batch_reject_material_identity_update
BEFORE UPDATE ON item_batch
FOR EACH ROW
BEGIN
  IF NOT (NEW.item_id <=> OLD.item_id)
    OR NOT (NEW.material_variant_id <=> OLD.material_variant_id)
    OR NOT (NEW.material_variant_code_snapshot <=> OLD.material_variant_code_snapshot) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'item batch material identity is immutable';
  END IF;
END;

ALTER TABLE production_item_allocation
  ADD COLUMN material_variant_id BIGINT UNSIGNED NOT NULL AFTER item_id,
  ADD UNIQUE KEY uk_production_item_allocation_variant_reference (
    id,
    demand_id,
    production_batch_id,
    item_id,
    batch_id,
    material_variant_id
  ),
  ADD CONSTRAINT fk_production_item_allocation_demand_variant FOREIGN KEY (
    demand_id,
    item_id,
    material_variant_id
  ) REFERENCES production_item_demand(id, item_id, material_variant_id),
  ADD CONSTRAINT fk_production_item_allocation_batch_variant FOREIGN KEY (
    batch_id,
    item_id,
    material_variant_id
  ) REFERENCES item_batch(id, item_id, material_variant_id);

ALTER TABLE outbound_detail
  ADD COLUMN material_variant_id BIGINT UNSIGNED NOT NULL AFTER item_id,
  ADD CONSTRAINT fk_outbound_detail_allocation_variant FOREIGN KEY (
    allocation_id,
    demand_id,
    production_batch_id,
    item_id,
    batch_id,
    material_variant_id
  ) REFERENCES production_item_allocation (
    id,
    demand_id,
    production_batch_id,
    item_id,
    batch_id,
    material_variant_id
  ),
  ADD CONSTRAINT fk_outbound_detail_batch_variant FOREIGN KEY (
    batch_id,
    item_id,
    material_variant_id
  ) REFERENCES item_batch(id, item_id, material_variant_id);

ALTER TABLE inbound_detail
  ADD COLUMN material_variant_id BIGINT UNSIGNED NOT NULL AFTER item_id,
  ADD CONSTRAINT fk_inbound_detail_variant FOREIGN KEY (material_variant_id, item_id)
    REFERENCES material_variants(id, material_product_id),
  ADD CONSTRAINT fk_inbound_detail_batch_variant FOREIGN KEY (
    batch_id,
    item_id,
    material_variant_id
  ) REFERENCES item_batch(id, item_id, material_variant_id);

ALTER TABLE return_detail
  ADD COLUMN material_variant_id BIGINT UNSIGNED NOT NULL AFTER item_id,
  ADD CONSTRAINT fk_return_detail_allocation_variant FOREIGN KEY (
    allocation_id,
    demand_id,
    production_batch_id,
    item_id,
    batch_id,
    material_variant_id
  ) REFERENCES production_item_allocation (
    id,
    demand_id,
    production_batch_id,
    item_id,
    batch_id,
    material_variant_id
  ),
  ADD CONSTRAINT fk_return_detail_batch_variant FOREIGN KEY (
    batch_id,
    item_id,
    material_variant_id
  ) REFERENCES item_batch(id, item_id, material_variant_id);

ALTER TABLE item_scrap
  ADD COLUMN material_variant_id BIGINT UNSIGNED NOT NULL AFTER item_id,
  ADD CONSTRAINT fk_item_scrap_allocation_variant FOREIGN KEY (
    allocation_id,
    demand_id,
    production_batch_id,
    item_id,
    batch_id,
    material_variant_id
  ) REFERENCES production_item_allocation (
    id,
    demand_id,
    production_batch_id,
    item_id,
    batch_id,
    material_variant_id
  ),
  ADD CONSTRAINT fk_item_scrap_batch_variant FOREIGN KEY (
    batch_id,
    item_id,
    material_variant_id
  ) REFERENCES item_batch(id, item_id, material_variant_id);

ALTER TABLE stock_check_detail
  ADD COLUMN material_variant_id BIGINT UNSIGNED NOT NULL AFTER item_id,
  ADD CONSTRAINT fk_stock_check_detail_variant FOREIGN KEY (material_variant_id, item_id)
    REFERENCES material_variants(id, material_product_id),
  ADD CONSTRAINT fk_stock_check_detail_batch_variant FOREIGN KEY (
    batch_id,
    item_id,
    material_variant_id
  ) REFERENCES item_batch(id, item_id, material_variant_id);

ALTER TABLE production_short_batch_authorization_detail
  ADD COLUMN material_variant_id BIGINT UNSIGNED NOT NULL AFTER item_id,
  ADD CONSTRAINT fk_short_batch_authorization_detail_demand_variant FOREIGN KEY (
    demand_id,
    item_id,
    material_variant_id
  ) REFERENCES production_item_demand(id, item_id, material_variant_id);

-- Scrap caused by an operation no longer derives a material range from that
-- operation. Each plan line is an administrator selection from the complete batch
-- BOM basis and may select any enabled variant under that base material.
ALTER TABLE production_scrap_supplement_plan_line
  ADD COLUMN requirement_basis_id BIGINT UNSIGNED NOT NULL AFTER production_batch_id,
  ADD COLUMN material_variant_id BIGINT UNSIGNED NOT NULL AFTER item_id,
  ADD CONSTRAINT fk_scrap_supplement_plan_line_basis_demand FOREIGN KEY (
    original_demand_id,
    production_batch_id,
    requirement_basis_id
  ) REFERENCES production_item_demand(id, production_batch_id, requirement_basis_id),
  ADD CONSTRAINT fk_scrap_supplement_plan_line_basis FOREIGN KEY (
    requirement_basis_id,
    production_batch_id,
    product_material_id,
    item_id
  ) REFERENCES production_material_requirement_basis (
    id,
    production_batch_id,
    product_material_id,
    material_product_id
  ),
  ADD CONSTRAINT fk_scrap_supplement_plan_line_variant FOREIGN KEY (
    material_variant_id,
    item_id
  ) REFERENCES material_variants(id, material_product_id);

ALTER TABLE inventory_transaction
  ADD COLUMN material_variant_id BIGINT UNSIGNED NOT NULL AFTER item_id,
  ADD CONSTRAINT fk_inventory_transaction_batch_variant FOREIGN KEY (
    batch_id,
    item_id,
    material_variant_id
  ) REFERENCES item_batch(id, item_id, material_variant_id);

CREATE TABLE inventory_material_variant_balance (
  material_variant_id BIGINT UNSIGNED NOT NULL,
  material_product_id BIGINT UNSIGNED NOT NULL,
  stock_status VARCHAR(20) NOT NULL,
  batch_status VARCHAR(20) NOT NULL,
  current_quantity BIGINT NOT NULL,
  version BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (material_variant_id, stock_status, batch_status),
  KEY idx_inventory_variant_balance_material (
    material_product_id,
    stock_status,
    batch_status,
    material_variant_id
  ),
  CONSTRAINT chk_inventory_variant_balance_stock_status CHECK (
    stock_status IN ('available', 'pending_inspection', 'frozen', 'defective')
  ),
  CONSTRAINT chk_inventory_variant_balance_batch_status CHECK (
    batch_status IN ('available', 'frozen', 'disabled')
  ),
  CONSTRAINT fk_inventory_variant_balance_variant FOREIGN KEY (
    material_variant_id,
    material_product_id
  ) REFERENCES material_variants(id, material_product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TRIGGER trg_inventory_variant_balance_reject_negative_insert
BEFORE INSERT ON inventory_material_variant_balance
FOR EACH ROW
BEGIN
  IF NEW.current_quantity < 0
    AND COALESCE(@company_inventory_test_cleanup, 0) <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'inventory variant balance cannot be negative';
  END IF;
END;

CREATE TRIGGER trg_inventory_variant_balance_reject_negative_update
BEFORE UPDATE ON inventory_material_variant_balance
FOR EACH ROW
BEGIN
  IF NEW.current_quantity < 0
    AND COALESCE(@company_inventory_test_cleanup, 0) <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'inventory variant balance cannot be negative';
  END IF;
END;

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

INSERT INTO permissions
  (parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
SELECT id, '物料需求管理', 'production:material-demands:view', 'page',
  '/production/material-demands', 'GET', '/api/production/material-demands', 233, 1
FROM permissions WHERE code = 'production:view'
UNION ALL
SELECT id, '配置版本需求', 'production:material-demands:configure', 'api',
  NULL, 'POST', '/api/production/batches/:batchId/material-demands/configurations', 234, 1
FROM permissions WHERE code = 'production:view'
UNION ALL
SELECT id, '人工补充需求', 'production:material-demands:add-manual', 'api',
  NULL, 'POST', '/api/production/material-demands/:demandId/additions', 235, 1
FROM permissions WHERE code = 'production:view'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name = VALUES(name),
  type = VALUES(type),
  route_path = VALUES(route_path),
  api_method = VALUES(api_method),
  api_path = VALUES(api_path),
  sort_order = VALUES(sort_order),
  status = 1,
  deleted_at = NULL;
