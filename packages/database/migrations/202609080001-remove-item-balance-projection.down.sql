-- Execute with inventory writers stopped; MySQL trigger/table DDL is not transactional.
-- Derived quantities are rebuilt from the ledger; projection revision counters restart at zero.
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
  CONSTRAINT fk_inventory_item_balance_item FOREIGN KEY (item_id) REFERENCES materials(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

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

INSERT INTO inventory_item_balance (item_id,stock_status,batch_status,current_quantity)
SELECT it.item_id,it.stock_status,ib.batch_status,CAST(SUM(it.quantity) AS SIGNED)
FROM inventory_transaction it
JOIN item_batch ib ON ib.id=it.batch_id
GROUP BY it.item_id,it.stock_status,ib.batch_status;

DROP TRIGGER trg_inventory_transaction_update_balances;
DROP TRIGGER trg_inventory_transaction_cleanup_balances;

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
