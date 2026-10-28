-- Supplier intent cannot be inferred from an order containing several suppliers.
-- Keep writers stopped and rebuild development data through the unified init entry.
CREATE TEMPORARY TABLE guard_purchase_order_supplier_and_amounts (
  invalid_value TINYINT NOT NULL,
  CONSTRAINT chk_purchase_supplier_amounts_empty CHECK(invalid_value=0)
) ENGINE=MEMORY;
INSERT INTO guard_purchase_order_supplier_and_amounts
SELECT 1 WHERE EXISTS(SELECT 1 FROM procurement_order)
  OR EXISTS(SELECT 1 FROM procurement_order_line)
  OR EXISTS(SELECT 1 FROM procurement_receipt)
  OR EXISTS(SELECT 1 FROM inbound_detail WHERE procurement_receipt_line_id IS NOT NULL)
  OR EXISTS(SELECT 1 FROM http_idempotency_records);
DROP TEMPORARY TABLE guard_purchase_order_supplier_and_amounts;

ALTER TABLE procurement_order
  ADD COLUMN supplier_id BIGINT UNSIGNED NOT NULL AFTER purchase_no,
  ADD KEY idx_procurement_order_supplier(supplier_id,created_at,id),
  ADD CONSTRAINT fk_procurement_order_supplier FOREIGN KEY(supplier_id) REFERENCES procurement_supplier(id);

ALTER TABLE procurement_order_line
  DROP FOREIGN KEY fk_procurement_order_line_supplier,
  DROP INDEX idx_procurement_order_line_supplier,
  DROP INDEX uk_procurement_order_line_identity,
  DROP COLUMN supplier_id,
  ADD COLUMN tax_exclusive_amount VARCHAR(100) NULL AFTER planned_quantity,
  ADD COLUMN tax_inclusive_amount VARCHAR(100) NULL AFTER tax_exclusive_amount,
  ADD UNIQUE KEY uk_procurement_order_line_identity(purchase_order_id,item_id,material_variant_id);

-- Only the newly owned fields are guarded here; application commands retain
-- the existing root/source/identity checks and lock order.
CREATE TRIGGER trg_procurement_order_supplier_frozen BEFORE UPDATE ON procurement_order
FOR EACH ROW
BEGIN
  IF NEW.supplier_id<>OLD.supplier_id
    AND (OLD.status<>'draft' OR OLD.ordered_at IS NOT NULL OR OLD.supplement_reason IS NOT NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Ordered and supplement purchase suppliers are immutable';
  END IF;
END;

CREATE TRIGGER trg_procurement_order_line_amounts_frozen BEFORE UPDATE ON procurement_order_line
FOR EACH ROW
BEGIN
  IF (NOT (BINARY NEW.tax_exclusive_amount <=> BINARY OLD.tax_exclusive_amount)
      OR NOT (BINARY NEW.tax_inclusive_amount <=> BINARY OLD.tax_inclusive_amount))
    AND (OLD.status<>'draft' OR EXISTS(
      SELECT 1 FROM procurement_order source_order
      WHERE source_order.id=OLD.purchase_order_id
        AND (source_order.status<>'draft' OR source_order.ordered_at IS NOT NULL)
    )) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Ordered purchase line amount texts are immutable';
  END IF;
END;
