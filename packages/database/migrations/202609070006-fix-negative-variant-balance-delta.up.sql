DROP TRIGGER trg_inventory_transaction_update_variant_balance;

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
