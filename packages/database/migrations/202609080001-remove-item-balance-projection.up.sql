-- Execute with inventory writers stopped; MySQL trigger/table DDL is not transactional.
DROP TRIGGER trg_inventory_transaction_update_balances;
DROP TRIGGER trg_inventory_transaction_cleanup_balances;
DROP TRIGGER trg_item_batch_move_item_balance;
DROP TABLE inventory_item_balance;

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
