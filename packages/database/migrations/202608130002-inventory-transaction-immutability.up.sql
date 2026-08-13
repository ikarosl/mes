CREATE TRIGGER trg_inventory_transaction_reject_update
BEFORE UPDATE ON inventory_transaction
FOR EACH ROW
BEGIN
  IF COALESCE(@company_inventory_test_cleanup, 0) <> 1
    OR (DATABASE() NOT LIKE '%\\_test' AND DATABASE() NOT LIKE '%\\_ci') THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'inventory_transaction is immutable; append a reversal transaction instead';
  END IF;
END;

CREATE TRIGGER trg_inventory_transaction_reject_delete
BEFORE DELETE ON inventory_transaction
FOR EACH ROW
BEGIN
  IF COALESCE(@company_inventory_test_cleanup, 0) <> 1
    OR (DATABASE() NOT LIKE '%\\_test' AND DATABASE() NOT LIKE '%\\_ci') THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'inventory_transaction is immutable; append a reversal transaction instead';
  END IF;
END;
