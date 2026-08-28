ALTER TABLE production_item_demand
  ADD COLUMN item_code_snapshot VARCHAR(100) NULL AFTER item_id,
  ADD COLUMN item_name_snapshot VARCHAR(200) NULL AFTER item_code_snapshot,
  ADD COLUMN remaining_number BIGINT NULL AFTER need_number,
  ADD COLUMN fulfilled_by BIGINT UNSIGNED NULL AFTER business_status,
  ADD COLUMN fulfilled_at DATETIME NULL AFTER fulfilled_by;

UPDATE production_item_demand demand
JOIN products product ON product.id=demand.item_id
SET demand.item_code_snapshot=product.item_code,
    demand.item_name_snapshot=product.product_name;

CREATE TEMPORARY TABLE tmp_demand_fulfillment AS
SELECT demand.id,
  COALESCE(SUM(CASE WHEN outbound.status='completed' THEN detail.outbound_number ELSE 0 END),0)
    outbound_number,
  SUBSTRING_INDEX(
    GROUP_CONCAT(
      CASE WHEN outbound.status='completed' THEN outbound.operator_id END
      ORDER BY outbound.outbound_at DESC,outbound.id DESC SEPARATOR ','
    ),
    ',',1
  ) fulfilled_by,
  MAX(CASE WHEN outbound.status='completed' THEN outbound.outbound_at END) fulfilled_at
FROM production_item_demand demand
LEFT JOIN outbound_detail detail ON detail.demand_id=demand.id
LEFT JOIN outbound_order outbound ON outbound.id=detail.outbound_id
GROUP BY demand.id;

UPDATE production_item_demand demand
JOIN tmp_demand_fulfillment progress ON progress.id=demand.id
SET demand.remaining_number=GREATEST(
      CAST(demand.need_number AS SIGNED)-CAST(progress.outbound_number AS SIGNED),
      0
    ),
    demand.fulfilled_by=CASE
      WHEN demand.business_status='active' AND progress.outbound_number>=demand.need_number
        THEN CAST(progress.fulfilled_by AS UNSIGNED)
      ELSE NULL
    END,
    demand.fulfilled_at=CASE
      WHEN demand.business_status='active' AND progress.outbound_number>=demand.need_number
        THEN progress.fulfilled_at
      ELSE NULL
    END,
    demand.business_status=CASE
      WHEN demand.business_status='active' AND progress.outbound_number>=demand.need_number
        THEN 'fulfilled'
      ELSE demand.business_status
    END;

DROP TEMPORARY TABLE tmp_demand_fulfillment;

ALTER TABLE production_item_demand
  DROP CHECK chk_production_item_demand_status,
  MODIFY COLUMN item_code_snapshot VARCHAR(100) NOT NULL,
  MODIFY COLUMN item_name_snapshot VARCHAR(200) NOT NULL,
  MODIFY COLUMN remaining_number BIGINT NOT NULL,
  ADD KEY idx_production_item_demand_status_item (business_status,item_id,id),
  ADD CONSTRAINT fk_production_item_demand_fulfilled_by
    FOREIGN KEY (fulfilled_by) REFERENCES users(id),
  ADD CONSTRAINT chk_production_item_demand_status CHECK (
    business_status IN ('active','fulfilled','cancelled')
  ),
  ADD CONSTRAINT chk_production_item_demand_remaining CHECK (
    remaining_number>=0 AND remaining_number<=need_number
  ),
  ADD CONSTRAINT chk_production_item_demand_terminal CHECK (
    (business_status='active' AND remaining_number>0
      AND fulfilled_by IS NULL AND fulfilled_at IS NULL)
    OR
    (business_status='fulfilled' AND remaining_number=0
      AND fulfilled_by IS NOT NULL AND fulfilled_at IS NOT NULL)
    OR
    (business_status='cancelled'
      AND fulfilled_by IS NULL AND fulfilled_at IS NULL)
  );

CREATE TABLE inventory_batch_balance (
  batch_id BIGINT UNSIGNED NOT NULL,
  item_id BIGINT UNSIGNED NOT NULL,
  stock_status VARCHAR(20) NOT NULL,
  current_quantity BIGINT NOT NULL,
  version BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (batch_id,stock_status),
  KEY idx_inventory_batch_balance_item_status (item_id,stock_status,batch_id),
  CONSTRAINT chk_inventory_batch_balance_status CHECK (
    stock_status IN ('available','pending_inspection','frozen','defective')
  ),
  CONSTRAINT fk_inventory_batch_balance_batch_item FOREIGN KEY (batch_id,item_id)
    REFERENCES item_batch(id,item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_item_balance (
  item_id BIGINT UNSIGNED NOT NULL,
  stock_status VARCHAR(20) NOT NULL,
  batch_status VARCHAR(20) NOT NULL,
  current_quantity BIGINT NOT NULL,
  version BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (item_id,stock_status,batch_status),
  CONSTRAINT chk_inventory_item_balance_stock_status CHECK (
    stock_status IN ('available','pending_inspection','frozen','defective')
  ),
  CONSTRAINT chk_inventory_item_balance_batch_status CHECK (
    batch_status IN ('available','frozen','disabled')
  ),
  CONSTRAINT fk_inventory_item_balance_item FOREIGN KEY (item_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TEMPORARY TABLE tmp_invalid_inventory_balance (
  invalid_value TINYINT NOT NULL,
  CONSTRAINT chk_tmp_invalid_inventory_balance CHECK (invalid_value=0)
) ENGINE=MEMORY;

INSERT INTO tmp_invalid_inventory_balance (invalid_value)
SELECT 1
FROM inventory_transaction
GROUP BY batch_id,item_id,stock_status
HAVING SUM(quantity)<0
LIMIT 1;

DROP TEMPORARY TABLE tmp_invalid_inventory_balance;

INSERT INTO inventory_batch_balance (batch_id,item_id,stock_status,current_quantity)
SELECT batch_id,item_id,stock_status,CAST(SUM(quantity) AS SIGNED)
FROM inventory_transaction
GROUP BY batch_id,item_id,stock_status;

INSERT INTO inventory_item_balance (item_id,stock_status,batch_status,current_quantity)
SELECT balance.item_id,balance.stock_status,batch.batch_status,SUM(balance.current_quantity)
FROM inventory_batch_balance balance
JOIN item_batch batch ON batch.id=balance.batch_id
GROUP BY balance.item_id,balance.stock_status,batch.batch_status;

CREATE TRIGGER trg_inventory_batch_balance_reject_negative_insert
BEFORE INSERT ON inventory_batch_balance
FOR EACH ROW
BEGIN
  IF NEW.current_quantity<0
    AND COALESCE(@company_inventory_test_cleanup,0)<>1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='inventory batch balance cannot be negative';
  END IF;
END;

CREATE TRIGGER trg_inventory_batch_balance_reject_negative_update
BEFORE UPDATE ON inventory_batch_balance
FOR EACH ROW
BEGIN
  IF NEW.current_quantity<0
    AND COALESCE(@company_inventory_test_cleanup,0)<>1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='inventory batch balance cannot be negative';
  END IF;
END;

CREATE TRIGGER trg_inventory_item_balance_reject_negative_insert
BEFORE INSERT ON inventory_item_balance
FOR EACH ROW
BEGIN
  IF NEW.current_quantity<0
    AND COALESCE(@company_inventory_test_cleanup,0)<>1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='inventory item balance cannot be negative';
  END IF;
END;

CREATE TRIGGER trg_inventory_item_balance_reject_negative_update
BEFORE UPDATE ON inventory_item_balance
FOR EACH ROW
BEGIN
  IF NEW.current_quantity<0
    AND COALESCE(@company_inventory_test_cleanup,0)<>1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='inventory item balance cannot be negative';
  END IF;
END;

CREATE TRIGGER trg_inventory_transaction_update_balances
AFTER INSERT ON inventory_transaction
FOR EACH ROW
BEGIN
  DECLARE current_batch_status VARCHAR(20);
  SELECT batch_status INTO current_batch_status FROM item_batch WHERE id=NEW.batch_id;

  INSERT INTO inventory_batch_balance
    (batch_id,item_id,stock_status,current_quantity)
  VALUES (NEW.batch_id,NEW.item_id,NEW.stock_status,0)
  ON DUPLICATE KEY UPDATE
    batch_id=VALUES(batch_id);

  UPDATE inventory_batch_balance
  SET current_quantity=current_quantity+CAST(NEW.quantity AS SIGNED),
      version=version+1
  WHERE batch_id=NEW.batch_id AND stock_status=NEW.stock_status;

  INSERT INTO inventory_item_balance
    (item_id,stock_status,batch_status,current_quantity)
  VALUES (NEW.item_id,NEW.stock_status,current_batch_status,0)
  ON DUPLICATE KEY UPDATE
    item_id=VALUES(item_id);

  UPDATE inventory_item_balance
  SET current_quantity=current_quantity+CAST(NEW.quantity AS SIGNED),
      version=version+1
  WHERE item_id=NEW.item_id AND stock_status=NEW.stock_status
    AND batch_status=current_batch_status;
END;

CREATE TRIGGER trg_inventory_transaction_cleanup_balances
AFTER DELETE ON inventory_transaction
FOR EACH ROW
BEGIN
  DECLARE current_batch_status VARCHAR(20);
  SELECT batch_status INTO current_batch_status FROM item_batch WHERE id=OLD.batch_id;

  UPDATE inventory_batch_balance
  SET current_quantity=current_quantity-CAST(OLD.quantity AS SIGNED),version=version+1
  WHERE batch_id=OLD.batch_id AND stock_status=OLD.stock_status;

  UPDATE inventory_item_balance
  SET current_quantity=current_quantity-CAST(OLD.quantity AS SIGNED),version=version+1
  WHERE item_id=OLD.item_id AND stock_status=OLD.stock_status
    AND batch_status=current_batch_status;

  DELETE FROM inventory_batch_balance
  WHERE batch_id=OLD.batch_id AND stock_status=OLD.stock_status AND current_quantity=0;
  DELETE FROM inventory_item_balance
  WHERE item_id=OLD.item_id AND stock_status=OLD.stock_status
    AND batch_status=current_batch_status AND current_quantity=0;
END;

CREATE TRIGGER trg_item_batch_move_item_balance
AFTER UPDATE ON item_batch
FOR EACH ROW
BEGIN
  IF OLD.batch_status<>NEW.batch_status THEN
    INSERT INTO inventory_item_balance
      (item_id,stock_status,batch_status,current_quantity)
    SELECT item_id,stock_status,NEW.batch_status,current_quantity
    FROM inventory_batch_balance
    WHERE batch_id=NEW.id
    ON DUPLICATE KEY UPDATE
      current_quantity=inventory_item_balance.current_quantity+VALUES(current_quantity),
      version=inventory_item_balance.version+1;

    UPDATE inventory_item_balance item_balance
    JOIN inventory_batch_balance batch_balance
      ON batch_balance.item_id=item_balance.item_id
      AND batch_balance.stock_status=item_balance.stock_status
      AND batch_balance.batch_id=NEW.id
    SET item_balance.current_quantity=item_balance.current_quantity-batch_balance.current_quantity,
        item_balance.version=item_balance.version+1
    WHERE item_balance.item_id=OLD.item_id
      AND item_balance.batch_status=OLD.batch_status;

    DELETE FROM inventory_item_balance
    WHERE item_id=OLD.item_id AND batch_status=OLD.batch_status AND current_quantity=0;
  END IF;
END;
