-- Stop all inventory writers while changing identity constraints and projection triggers.
-- Development transition: reset inventory documents and facts; no legacy identity conversion.
CREATE TEMPORARY TABLE guard_finished_goods_empty (ok TINYINT NOT NULL CHECK (ok=1));
INSERT INTO guard_finished_goods_empty SELECT IF(
  EXISTS (SELECT 1 FROM item_batch) OR EXISTS (SELECT 1 FROM inventory_transaction)
  OR EXISTS (SELECT 1 FROM inbound_order) OR EXISTS (SELECT 1 FROM inbound_detail)
  OR EXISTS (SELECT 1 FROM inventory_batch_balance)
  OR EXISTS (SELECT 1 FROM inventory_material_variant_balance),0,1);
DROP TEMPORARY TABLE guard_finished_goods_empty;

DROP TRIGGER trg_finished_inbound_order_insert;
DROP TRIGGER trg_finished_inbound_detail_insert;
DROP TRIGGER trg_finished_inbound_detail_update;
DROP TRIGGER trg_finished_inbound_detail_delete;
DROP TRIGGER trg_finished_inventory_transaction_insert;
DROP TRIGGER trg_finished_inbound_order_update;
DROP TRIGGER trg_inventory_transaction_update_balances;
DROP TRIGGER trg_inventory_transaction_cleanup_balances;
DROP TRIGGER trg_inventory_transaction_update_variant_balance;
DROP TRIGGER trg_inventory_transaction_cleanup_variant_balance;
DROP TRIGGER trg_item_batch_move_variant_balance;
DROP TRIGGER trg_item_batch_reject_material_identity_update;

ALTER TABLE production_item_allocation DROP FOREIGN KEY fk_production_item_allocation_stock_batch;
ALTER TABLE production_item_allocation DROP FOREIGN KEY fk_production_item_allocation_batch_variant;
ALTER TABLE outbound_detail DROP FOREIGN KEY fk_outbound_detail_stock_batch;
ALTER TABLE outbound_detail DROP FOREIGN KEY fk_outbound_detail_batch_variant;
ALTER TABLE inbound_detail DROP FOREIGN KEY fk_inbound_detail_batch_item;
ALTER TABLE inbound_detail DROP FOREIGN KEY fk_inbound_detail_batch_variant;
ALTER TABLE return_detail DROP FOREIGN KEY fk_return_detail_stock_batch;
ALTER TABLE return_detail DROP FOREIGN KEY fk_return_detail_batch_variant;
ALTER TABLE item_scrap DROP FOREIGN KEY fk_item_scrap_batch_item;
ALTER TABLE item_scrap DROP FOREIGN KEY fk_item_scrap_batch_variant;
ALTER TABLE stock_check_detail DROP FOREIGN KEY fk_stock_check_detail_batch_item;
ALTER TABLE stock_check_detail DROP FOREIGN KEY fk_stock_check_detail_batch_variant;
ALTER TABLE inventory_transaction DROP FOREIGN KEY fk_inventory_transaction_batch_item;
ALTER TABLE inventory_transaction DROP FOREIGN KEY fk_inventory_transaction_batch_variant;
ALTER TABLE inventory_batch_balance DROP FOREIGN KEY fk_inventory_batch_balance_batch_item;
ALTER TABLE item_batch DROP FOREIGN KEY fk_item_batch_item;
ALTER TABLE item_batch DROP FOREIGN KEY fk_item_batch_variant;
ALTER TABLE inbound_detail DROP FOREIGN KEY fk_inbound_detail_item;
ALTER TABLE inbound_detail DROP FOREIGN KEY fk_inbound_detail_variant;
ALTER TABLE inventory_transaction DROP FOREIGN KEY fk_inventory_transaction_item;


ALTER TABLE inventory_transaction
  DROP FOREIGN KEY fk_inventory_transaction_batch_product,
  DROP FOREIGN KEY fk_inventory_transaction_finished_detail,
  DROP CHECK chk_inventory_transaction_identity,
  DROP CHECK chk_inventory_transaction_finished_scope,
  DROP INDEX uk_inventory_transaction_finished_once,
  DROP INDEX idx_inventory_transaction_product_stock,
  DROP INDEX idx_inventory_transaction_batch_product,
  DROP INDEX idx_inventory_transaction_finished_detail,
  DROP COLUMN product_id,
  MODIFY COLUMN item_id BIGINT UNSIGNED NOT NULL,
  MODIFY COLUMN material_variant_id BIGINT UNSIGNED NOT NULL;

ALTER TABLE inventory_batch_balance
  DROP FOREIGN KEY fk_inventory_batch_balance_batch_product,
  DROP CHECK chk_inventory_batch_balance_identity,
  DROP INDEX idx_inventory_batch_balance_product_status,
  DROP INDEX idx_inventory_batch_balance_batch_product,
  DROP COLUMN product_id,
  MODIFY COLUMN item_id BIGINT UNSIGNED NOT NULL;

ALTER TABLE inbound_detail
  DROP FOREIGN KEY fk_inbound_detail_finished_order,
  DROP FOREIGN KEY fk_inbound_detail_batch_product,
  DROP CHECK chk_inbound_detail_identity,
  DROP INDEX uk_inbound_detail_order_product,
  DROP INDEX uk_inbound_detail_finished_reference,
  DROP INDEX idx_inbound_detail_batch_product,
  DROP COLUMN product_id,
  DROP COLUMN requested_batch_code,
  MODIFY COLUMN item_id BIGINT UNSIGNED NOT NULL,
  MODIFY COLUMN material_variant_id BIGINT UNSIGNED NOT NULL,
  MODIFY COLUMN batch_id BIGINT UNSIGNED NOT NULL;

ALTER TABLE inbound_order
  DROP FOREIGN KEY fk_inbound_order_output_source,
  DROP CHECK chk_inbound_order_finished_identity,
  DROP CHECK chk_inbound_order_source_type,
  DROP INDEX uk_inbound_order_id_product,
  DROP INDEX uk_inbound_order_finished_once,
  DROP INDEX idx_inbound_order_output_source,
  DROP COLUMN active_finished_slot,
  DROP COLUMN product_id,
  DROP COLUMN output_revision_id,
  ADD CONSTRAINT chk_inbound_order_source_type CHECK (source_type IN ('self_made','purchased','outsourced','return_inbound','stock_check_generated','other'));

ALTER TABLE item_batch
  DROP FOREIGN KEY fk_item_batch_product,
  DROP FOREIGN KEY fk_item_batch_source_product,
  DROP CHECK chk_item_batch_identity,
  DROP CHECK chk_item_batch_source_type,
  DROP INDEX uk_item_batch_id_product,
  DROP INDEX uk_item_batch_product_code,
  DROP INDEX idx_item_batch_product_status,
  DROP INDEX idx_item_batch_source_product,
  DROP COLUMN product_id,
  MODIFY COLUMN item_id BIGINT UNSIGNED NOT NULL,
  MODIFY COLUMN material_variant_id BIGINT UNSIGNED NOT NULL,
  MODIFY COLUMN material_variant_code_snapshot VARCHAR(180) NOT NULL,
  ADD CONSTRAINT chk_item_batch_source_type CHECK (source_type IN ('self_made','purchased','outsourced','return_inbound','stock_check_generated','other'));

ALTER TABLE production_output_revision DROP INDEX uk_output_revision_finished_source;

ALTER TABLE production_item_allocation ADD CONSTRAINT fk_production_item_allocation_stock_batch FOREIGN KEY (batch_id,item_id) REFERENCES item_batch(id,item_id);
ALTER TABLE production_item_allocation ADD CONSTRAINT fk_production_item_allocation_batch_variant FOREIGN KEY (batch_id,item_id,material_variant_id) REFERENCES item_batch(id,item_id,material_variant_id);
ALTER TABLE outbound_detail ADD CONSTRAINT fk_outbound_detail_stock_batch FOREIGN KEY (batch_id,item_id) REFERENCES item_batch(id,item_id);
ALTER TABLE outbound_detail ADD CONSTRAINT fk_outbound_detail_batch_variant FOREIGN KEY (batch_id,item_id,material_variant_id) REFERENCES item_batch(id,item_id,material_variant_id);
ALTER TABLE inbound_detail ADD CONSTRAINT fk_inbound_detail_batch_item FOREIGN KEY (batch_id,item_id) REFERENCES item_batch(id,item_id);
ALTER TABLE inbound_detail ADD CONSTRAINT fk_inbound_detail_batch_variant FOREIGN KEY (batch_id,item_id,material_variant_id) REFERENCES item_batch(id,item_id,material_variant_id);
ALTER TABLE return_detail ADD CONSTRAINT fk_return_detail_stock_batch FOREIGN KEY (batch_id,item_id) REFERENCES item_batch(id,item_id);
ALTER TABLE return_detail ADD CONSTRAINT fk_return_detail_batch_variant FOREIGN KEY (batch_id,item_id,material_variant_id) REFERENCES item_batch(id,item_id,material_variant_id);
ALTER TABLE item_scrap ADD CONSTRAINT fk_item_scrap_batch_item FOREIGN KEY (batch_id,item_id) REFERENCES item_batch(id,item_id);
ALTER TABLE item_scrap ADD CONSTRAINT fk_item_scrap_batch_variant FOREIGN KEY (batch_id,item_id,material_variant_id) REFERENCES item_batch(id,item_id,material_variant_id);
ALTER TABLE stock_check_detail ADD CONSTRAINT fk_stock_check_detail_batch_item FOREIGN KEY (batch_id,item_id) REFERENCES item_batch(id,item_id);
ALTER TABLE stock_check_detail ADD CONSTRAINT fk_stock_check_detail_batch_variant FOREIGN KEY (batch_id,item_id,material_variant_id) REFERENCES item_batch(id,item_id,material_variant_id);
ALTER TABLE inventory_transaction ADD CONSTRAINT fk_inventory_transaction_batch_item FOREIGN KEY (batch_id,item_id) REFERENCES item_batch(id,item_id);
ALTER TABLE inventory_transaction ADD CONSTRAINT fk_inventory_transaction_batch_variant FOREIGN KEY (batch_id,item_id,material_variant_id) REFERENCES item_batch(id,item_id,material_variant_id);
ALTER TABLE inventory_batch_balance ADD CONSTRAINT fk_inventory_batch_balance_batch_item FOREIGN KEY (batch_id,item_id) REFERENCES item_batch(id,item_id);
ALTER TABLE item_batch ADD CONSTRAINT fk_item_batch_item FOREIGN KEY (item_id) REFERENCES materials(id);
ALTER TABLE item_batch ADD CONSTRAINT fk_item_batch_variant FOREIGN KEY (material_variant_id,item_id) REFERENCES material_variants(id,material_id);
ALTER TABLE inbound_detail ADD CONSTRAINT fk_inbound_detail_item FOREIGN KEY (item_id) REFERENCES materials(id);
ALTER TABLE inbound_detail ADD CONSTRAINT fk_inbound_detail_variant FOREIGN KEY (material_variant_id,item_id) REFERENCES material_variants(id,material_id);
ALTER TABLE inventory_transaction ADD CONSTRAINT fk_inventory_transaction_item FOREIGN KEY (item_id) REFERENCES materials(id);

CREATE TRIGGER trg_inventory_transaction_update_balances
AFTER INSERT ON inventory_transaction
FOR EACH ROW
BEGIN
  INSERT INTO inventory_batch_balance (batch_id,item_id,stock_status,current_quantity)
  VALUES (NEW.batch_id,NEW.item_id,NEW.stock_status,0)
  ON DUPLICATE KEY UPDATE batch_id=VALUES(batch_id);

  UPDATE inventory_batch_balance
  SET current_quantity=current_quantity+CAST(NEW.quantity AS SIGNED),version=version+1
  WHERE batch_id=NEW.batch_id AND stock_status=NEW.stock_status;
END;

CREATE TRIGGER trg_inventory_transaction_cleanup_balances
AFTER DELETE ON inventory_transaction
FOR EACH ROW
BEGIN
  UPDATE inventory_batch_balance
  SET current_quantity=current_quantity-CAST(OLD.quantity AS SIGNED),version=version+1
  WHERE batch_id=OLD.batch_id AND stock_status=OLD.stock_status;

  DELETE FROM inventory_batch_balance
  WHERE batch_id=OLD.batch_id AND stock_status=OLD.stock_status AND current_quantity=0;
END;

CREATE TRIGGER trg_inventory_transaction_update_variant_balance
AFTER INSERT ON inventory_transaction
FOR EACH ROW
BEGIN
  DECLARE current_batch_status VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
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
    0
  )
  ON DUPLICATE KEY UPDATE
    material_variant_id = VALUES(material_variant_id);

  UPDATE inventory_material_variant_balance
  SET current_quantity = current_quantity + CAST(NEW.quantity AS SIGNED),
      version = version + 1
  WHERE material_variant_id = NEW.material_variant_id
    AND stock_status = NEW.stock_status
    AND batch_status = current_batch_status;
END;

CREATE TRIGGER trg_inventory_transaction_cleanup_variant_balance
AFTER DELETE ON inventory_transaction
FOR EACH ROW
BEGIN
  DECLARE current_batch_status VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
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

DELETE rp FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id
WHERE p.code IN ('production:inbounds:create-finished','production:inbounds:confirm-finished','production:inbounds:cancel-finished');
DELETE FROM permissions WHERE code IN ('production:inbounds:create-finished','production:inbounds:confirm-finished','production:inbounds:cancel-finished');
