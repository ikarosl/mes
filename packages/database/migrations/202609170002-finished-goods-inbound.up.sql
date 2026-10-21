-- Stop all inventory writers while changing identity constraints and projection triggers.
-- Development transition: reset inventory documents and facts; no legacy identity conversion.
CREATE TEMPORARY TABLE guard_finished_goods_empty (ok TINYINT NOT NULL CHECK (ok=1));
INSERT INTO guard_finished_goods_empty SELECT IF(
  EXISTS (SELECT 1 FROM item_batch) OR EXISTS (SELECT 1 FROM inventory_transaction)
  OR EXISTS (SELECT 1 FROM inbound_order) OR EXISTS (SELECT 1 FROM inbound_detail)
  OR EXISTS (SELECT 1 FROM inventory_batch_balance)
  OR EXISTS (SELECT 1 FROM inventory_material_variant_balance),0,1);
DROP TEMPORARY TABLE guard_finished_goods_empty;

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

ALTER TABLE production_output_revision
  ADD UNIQUE KEY uk_output_revision_finished_source (id,production_batch_id,work_order_id,product_id);

ALTER TABLE item_batch
  MODIFY COLUMN item_id BIGINT UNSIGNED NULL,
  MODIFY COLUMN material_variant_id BIGINT UNSIGNED NULL,
  MODIFY COLUMN material_variant_code_snapshot VARCHAR(180) NULL,
  ADD COLUMN product_id BIGINT UNSIGNED NULL AFTER material_variant_id,
  DROP CHECK chk_item_batch_source_type,
  ADD CONSTRAINT chk_item_batch_source_type CHECK (source_type IN ('self_made','production_extra','purchased','outsourced','return_inbound','stock_check_generated','other')),
  ADD CONSTRAINT chk_item_batch_identity CHECK (
    (product_id IS NULL AND item_id IS NOT NULL AND material_variant_id IS NOT NULL AND material_variant_code_snapshot IS NOT NULL AND source_type NOT IN ('self_made','production_extra'))
    OR (product_id IS NOT NULL AND item_id IS NULL AND material_variant_id IS NULL AND material_variant_code_snapshot IS NULL
      AND source_type IN ('self_made','production_extra') AND source_work_order_id IS NOT NULL AND source_production_batch_id IS NOT NULL)
  ),
  ADD UNIQUE KEY uk_item_batch_id_product (id,product_id),
  ADD UNIQUE KEY uk_item_batch_product_code (product_id,batch_code),
  ADD KEY idx_item_batch_product_status (product_id,batch_status),
  ADD KEY idx_item_batch_source_product (source_production_batch_id,product_id),
  ADD CONSTRAINT fk_item_batch_product FOREIGN KEY (product_id) REFERENCES products(id),
  ADD CONSTRAINT fk_item_batch_source_product FOREIGN KEY (source_production_batch_id,product_id) REFERENCES production_batches(id,product_id);

ALTER TABLE inbound_order
  ADD COLUMN product_id BIGINT UNSIGNED NULL AFTER production_batch_id,
  ADD COLUMN output_revision_id BIGINT UNSIGNED NULL AFTER product_id,
  ADD COLUMN active_finished_slot TINYINT GENERATED ALWAYS AS
    (CASE WHEN source_type IN ('self_made','production_extra') AND status IN ('pending','completed') THEN 1 ELSE NULL END) STORED,
  DROP CHECK chk_inbound_order_source_type,
  ADD CONSTRAINT chk_inbound_order_source_type CHECK (source_type IN ('self_made','production_extra','purchased','outsourced','return_inbound','stock_check_generated','other')),
  ADD CONSTRAINT chk_inbound_order_finished_identity CHECK (
    (source_type IN ('self_made','production_extra') AND product_id IS NOT NULL AND output_revision_id IS NOT NULL AND production_batch_id IS NOT NULL AND work_order_id IS NOT NULL AND provider IS NULL)
    OR (source_type NOT IN ('self_made','production_extra') AND product_id IS NULL AND output_revision_id IS NULL)
  ),
  ADD UNIQUE KEY uk_inbound_order_id_product (id,product_id),
  ADD UNIQUE KEY uk_inbound_order_finished_once (production_batch_id,source_type,active_finished_slot),
  ADD KEY idx_inbound_order_output_source (output_revision_id,production_batch_id,work_order_id,product_id),
  ADD CONSTRAINT fk_inbound_order_output_source FOREIGN KEY (output_revision_id,production_batch_id,work_order_id,product_id)
    REFERENCES production_output_revision(id,production_batch_id,work_order_id,product_id);

ALTER TABLE inbound_detail
  MODIFY COLUMN item_id BIGINT UNSIGNED NULL,
  MODIFY COLUMN material_variant_id BIGINT UNSIGNED NULL,
  MODIFY COLUMN batch_id BIGINT UNSIGNED NULL,
  ADD COLUMN product_id BIGINT UNSIGNED NULL AFTER material_variant_id,
  ADD COLUMN requested_batch_code VARCHAR(100) NULL AFTER batch_id,
  ADD CONSTRAINT chk_inbound_detail_identity CHECK (
    (product_id IS NULL AND item_id IS NOT NULL AND material_variant_id IS NOT NULL AND batch_id IS NOT NULL AND requested_batch_code IS NULL)
    OR (product_id IS NOT NULL AND item_id IS NULL AND material_variant_id IS NULL AND requested_batch_code IS NOT NULL
      AND CHAR_LENGTH(TRIM(requested_batch_code))>0 AND stock_status='available')
  ),
  ADD UNIQUE KEY uk_inbound_detail_order_product (inbound_id,product_id),
  ADD UNIQUE KEY uk_inbound_detail_finished_reference (id,product_id,batch_id),
  ADD KEY idx_inbound_detail_batch_product (batch_id,product_id),
  ADD CONSTRAINT fk_inbound_detail_finished_order FOREIGN KEY (inbound_id,product_id) REFERENCES inbound_order(id,product_id),
  ADD CONSTRAINT fk_inbound_detail_batch_product FOREIGN KEY (batch_id,product_id) REFERENCES item_batch(id,product_id);

ALTER TABLE inventory_transaction
  MODIFY COLUMN item_id BIGINT UNSIGNED NULL,
  MODIFY COLUMN material_variant_id BIGINT UNSIGNED NULL,
  ADD COLUMN product_id BIGINT UNSIGNED NULL AFTER material_variant_id,
  ADD CONSTRAINT chk_inventory_transaction_identity CHECK (
    (product_id IS NULL AND item_id IS NOT NULL AND material_variant_id IS NOT NULL)
    OR (product_id IS NOT NULL AND item_id IS NULL AND material_variant_id IS NULL)
  ),
  ADD CONSTRAINT chk_inventory_transaction_finished_scope CHECK (product_id IS NULL OR
    (transaction_type='production_inbound' AND reference_type='inbound_detail' AND quantity>0 AND stock_status='available'
      AND reversal_of_transaction_id IS NULL AND transaction_group_key IS NULL)),
  ADD UNIQUE KEY uk_inventory_transaction_finished_once (product_id,reference_type,reference_detail_id,transaction_type),
  ADD KEY idx_inventory_transaction_product_stock (product_id,batch_id,stock_status,created_at),
  ADD KEY idx_inventory_transaction_batch_product (batch_id,product_id),
  ADD KEY idx_inventory_transaction_finished_detail (reference_detail_id,product_id,batch_id),
  ADD CONSTRAINT fk_inventory_transaction_batch_product FOREIGN KEY (batch_id,product_id) REFERENCES item_batch(id,product_id),
  ADD CONSTRAINT fk_inventory_transaction_finished_detail FOREIGN KEY (reference_detail_id,product_id,batch_id) REFERENCES inbound_detail(id,product_id,batch_id);

ALTER TABLE inventory_batch_balance
  MODIFY COLUMN item_id BIGINT UNSIGNED NULL,
  ADD COLUMN product_id BIGINT UNSIGNED NULL AFTER item_id,
  ADD CONSTRAINT chk_inventory_batch_balance_identity CHECK (
    (product_id IS NULL AND item_id IS NOT NULL) OR (product_id IS NOT NULL AND item_id IS NULL)
  ),
  ADD KEY idx_inventory_batch_balance_product_status (product_id,stock_status,batch_id),
  ADD KEY idx_inventory_batch_balance_batch_product (batch_id,product_id),
  ADD CONSTRAINT fk_inventory_batch_balance_batch_product FOREIGN KEY (batch_id,product_id) REFERENCES item_batch(id,product_id);

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
  INSERT INTO inventory_batch_balance (batch_id,item_id,product_id,stock_status,current_quantity)
  VALUES (NEW.batch_id,NEW.item_id,NEW.product_id,NEW.stock_status,0)
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
  IF NEW.product_id IS NULL THEN
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
  END IF;
END;


CREATE TRIGGER trg_inventory_transaction_cleanup_variant_balance
AFTER DELETE ON inventory_transaction
FOR EACH ROW
BEGIN
  DECLARE current_batch_status VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
  IF OLD.product_id IS NULL THEN
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
  END IF;
END;

CREATE TRIGGER trg_item_batch_move_variant_balance
AFTER UPDATE ON item_batch
FOR EACH ROW
BEGIN
  IF NEW.product_id IS NULL AND OLD.batch_status <> NEW.batch_status THEN
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
  IF NOT (NEW.item_id <=> OLD.item_id) OR NOT (NEW.material_variant_id <=> OLD.material_variant_id)
    OR NOT (NEW.product_id <=> OLD.product_id) OR NOT (NEW.material_variant_code_snapshot <=> OLD.material_variant_code_snapshot)
    OR (OLD.product_id IS NOT NULL AND (
      NOT (NEW.source_type <=> OLD.source_type) OR NOT (NEW.source_work_order_id <=> OLD.source_work_order_id)
      OR NOT (NEW.source_production_batch_id <=> OLD.source_production_batch_id) OR NOT (NEW.batch_code <=> OLD.batch_code)
      OR NOT (NEW.item_code_snapshot <=> OLD.item_code_snapshot) OR NOT (NEW.unit_snapshot <=> OLD.unit_snapshot))) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Inventory batch identity and finished output source are immutable';
  END IF;
END;

-- These guards permit the atomic confirmation sequence: create batch -> bind detail
-- -> append ledger -> mark order completed. A pending order is not itself a receipt.
CREATE TRIGGER trg_finished_inbound_order_insert
BEFORE INSERT ON inbound_order
FOR EACH ROW
BEGIN
  IF NEW.product_id IS NOT NULL AND NEW.status<>'pending' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='A finished-goods inbound starts as a pending order';
  END IF;
END;

CREATE TRIGGER trg_finished_inbound_detail_insert
BEFORE INSERT ON inbound_detail
FOR EACH ROW
BEGIN
  DECLARE parent_product BIGINT UNSIGNED;
  DECLARE parent_status VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
  SELECT product_id,status INTO parent_product,parent_status FROM inbound_order WHERE id=NEW.inbound_id;
  IF NOT (NEW.product_id <=> parent_product) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Inbound detail identity must match its order';
  END IF;
  IF NEW.product_id IS NOT NULL AND parent_status<>'pending' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Finished-goods details can only be created in pending orders';
  END IF;
END;

CREATE TRIGGER trg_finished_inbound_detail_update
BEFORE UPDATE ON inbound_detail
FOR EACH ROW
BEGIN
  DECLARE parent_status VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
  IF OLD.product_id IS NOT NULL OR NEW.product_id IS NOT NULL THEN
    SELECT status INTO parent_status FROM inbound_order WHERE id=OLD.inbound_id;
    IF NOT (NEW.product_id <=> OLD.product_id) OR NEW.inbound_id<>OLD.inbound_id OR parent_status<>'pending' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Finished-goods detail identity and completed receipts are immutable';
    END IF;
  END IF;
END;

CREATE TRIGGER trg_finished_inbound_detail_delete
BEFORE DELETE ON inbound_detail
FOR EACH ROW
BEGIN
  DECLARE parent_status VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
  IF OLD.product_id IS NOT NULL THEN
    SELECT status INTO parent_status FROM inbound_order WHERE id=OLD.inbound_id;
    IF parent_status<>'pending' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Keep finished-goods receipt and cancellation detail history';
    END IF;
  END IF;
END;

CREATE TRIGGER trg_finished_inventory_transaction_insert
BEFORE INSERT ON inventory_transaction
FOR EACH ROW
BEGIN
  IF NEW.product_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM inbound_detail d
    JOIN inbound_order o ON o.id=d.inbound_id
    JOIN item_batch b ON b.id=d.batch_id
    WHERE d.id=NEW.reference_detail_id AND d.product_id=NEW.product_id AND d.batch_id=NEW.batch_id
      AND o.status='pending' AND o.source_type IN ('self_made','production_extra')
      AND d.inbound_number=NEW.quantity AND d.unit_snapshot=NEW.unit_snapshot
      AND b.source_type=o.source_type AND b.source_work_order_id=o.work_order_id
      AND b.source_production_batch_id=o.production_batch_id AND b.product_id=o.product_id
      AND b.batch_code=d.requested_batch_code AND b.batch_status='available'
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Finished-goods ledger entry must match the pending receipt detail and source batch';
  END IF;
END;

CREATE TRIGGER trg_finished_inbound_order_update
BEFORE UPDATE ON inbound_order
FOR EACH ROW
BEGIN
  DECLARE expected_quantity BIGINT UNSIGNED;
  DECLARE matching_details BIGINT;
  IF OLD.product_id IS NOT NULL OR NEW.product_id IS NOT NULL THEN
    IF OLD.status<>'pending' OR NOT (NEW.product_id <=> OLD.product_id)
      OR NOT (NEW.source_type <=> OLD.source_type)
      OR NOT (NEW.production_batch_id <=> OLD.production_batch_id)
      OR NOT (NEW.work_order_id <=> OLD.work_order_id) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Finished-goods order source and finalized receipts are immutable';
    END IF;
    IF NEW.status='completed' THEN
      IF NEW.inbound_at IS NULL OR NEW.operator_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Finished-goods receipt requires confirmation time and operator';
      END IF;
      SELECT CASE WHEN NEW.source_type='self_made' THEN available_quantity ELSE extra_quantity END
        INTO expected_quantity FROM production_output_revision WHERE id=NEW.output_revision_id;
      SELECT COUNT(*) INTO matching_details
      FROM inbound_detail d JOIN item_batch b ON b.id=d.batch_id
      JOIN inventory_transaction t ON t.reference_detail_id=d.id AND t.reference_type='inbound_detail'
        AND t.product_id=d.product_id AND t.batch_id=d.batch_id AND t.transaction_type='production_inbound'
      WHERE d.inbound_id=NEW.id AND d.product_id=NEW.product_id AND d.inbound_number=expected_quantity
        AND expected_quantity>0 AND t.quantity=d.inbound_number AND t.stock_status='available'
        AND b.source_type=NEW.source_type AND b.source_work_order_id=NEW.work_order_id
        AND b.source_production_batch_id=NEW.production_batch_id AND b.product_id=NEW.product_id
        AND b.batch_code=d.requested_batch_code;
      IF matching_details<>1 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Confirm all approved finished output once with exactly one matching detail, batch and ledger entry';
      END IF;
    ELSEIF NEW.status='cancelled' AND EXISTS (SELECT 1 FROM inbound_detail WHERE inbound_id=NEW.id AND batch_id IS NOT NULL) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Cannot cancel a finished-goods order after its inventory batch has been created';
    END IF;
  END IF;
END;

INSERT INTO permissions (parent_id,name,code,type,api_method,api_path,sort_order,status)
SELECT id,'创建及编辑成品入库单','production:inbounds:create-finished','api','POST','/api/production/finished-goods-inbounds',93,1
FROM (SELECT id FROM permissions WHERE code='production:inbounds:view') parent;
INSERT INTO permissions (parent_id,name,code,type,api_method,api_path,sort_order,status)
SELECT id,'确认成品入库','production:inbounds:confirm-finished','api','POST','/api/production/finished-goods-inbounds/:inboundId/actions/confirm',94,1
FROM (SELECT id FROM permissions WHERE code='production:inbounds:view') parent;
INSERT INTO permissions (parent_id,name,code,type,api_method,api_path,sort_order,status)
SELECT id,'取消待确认成品入库单','production:inbounds:cancel-finished','api','POST','/api/production/finished-goods-inbounds/:inboundId/actions/cancel',95,1
FROM (SELECT id FROM permissions WHERE code='production:inbounds:view') parent;
