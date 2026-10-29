-- Free-text quotations cannot be interpreted as decimal prices or final totals.
-- Stop Procurement writers and rebuild development data through db:init.
CREATE TEMPORARY TABLE guard_purchase_order_line_total_amounts (
  invalid_value TINYINT NOT NULL,
  CONSTRAINT chk_purchase_line_total_amounts_empty CHECK(invalid_value=0)
) ENGINE=MEMORY;
INSERT INTO guard_purchase_order_line_total_amounts
SELECT 1 WHERE EXISTS(SELECT 1 FROM procurement_order)
  OR EXISTS(SELECT 1 FROM procurement_order_line)
  OR EXISTS(SELECT 1 FROM procurement_receipt)
  OR EXISTS(SELECT 1 FROM inbound_detail WHERE procurement_receipt_line_id IS NOT NULL)
  OR EXISTS(SELECT 1 FROM http_idempotency_records);
DROP TEMPORARY TABLE guard_purchase_order_line_total_amounts;

ALTER TABLE procurement_order_line
  ADD COLUMN tax_rate_percent DECIMAL(7,4) NOT NULL DEFAULT 13 AFTER tax_inclusive_amount,
  ADD COLUMN total_amount VARCHAR(128) NULL AFTER tax_rate_percent,
  ADD COLUMN total_amount_source VARCHAR(16) NULL AFTER total_amount,
  ADD CONSTRAINT chk_procurement_line_tax_rate CHECK(tax_rate_percent>=0 AND tax_rate_percent<=100),
  ADD CONSTRAINT chk_procurement_line_tax_exclusive_price CHECK(
    tax_exclusive_amount IS NULL OR REGEXP_LIKE(tax_exclusive_amount,'^[0-9]+([.][0-9]+)?$','c')
  ),
  ADD CONSTRAINT chk_procurement_line_tax_inclusive_price CHECK(
    tax_inclusive_amount IS NULL OR REGEXP_LIKE(tax_inclusive_amount,'^[0-9]+([.][0-9]+)?$','c')
  ),
  ADD CONSTRAINT chk_procurement_line_total_amount CHECK(
    (total_amount IS NULL AND total_amount_source IS NULL)
    OR (total_amount IS NOT NULL AND total_amount_source IS NOT NULL
      AND total_amount_source IN('manual','calculated')
      AND REGEXP_LIKE(total_amount,'^[0-9]+[.][0-9]{2}$','c'))
  );

DROP TRIGGER trg_procurement_order_line_amounts_frozen;
CREATE TRIGGER trg_procurement_order_line_amounts_frozen BEFORE UPDATE ON procurement_order_line
FOR EACH ROW
BEGIN
  IF (NEW.planned_quantity<>OLD.planned_quantity
      OR NOT (BINARY NEW.tax_exclusive_amount <=> BINARY OLD.tax_exclusive_amount)
      OR NOT (BINARY NEW.tax_inclusive_amount <=> BINARY OLD.tax_inclusive_amount)
      OR NEW.tax_rate_percent<>OLD.tax_rate_percent)
    AND (OLD.status<>'draft' OR EXISTS(
      SELECT 1 FROM procurement_order source_order
      WHERE source_order.id=OLD.purchase_order_id
        AND (source_order.status<>'draft' OR source_order.ordered_at IS NOT NULL)
    )) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Ordered purchase quantity, unit prices and tax rate are immutable';
  END IF;
  IF (NOT (BINARY NEW.total_amount <=> BINARY OLD.total_amount)
      OR NOT (BINARY NEW.total_amount_source <=> BINARY OLD.total_amount_source))
    AND (OLD.status<>'draft' OR EXISTS(
      SELECT 1 FROM procurement_order source_order
      WHERE source_order.id=OLD.purchase_order_id
        AND (source_order.status<>'draft' OR source_order.ordered_at IS NOT NULL)
    ))
    AND (OLD.status NOT IN('open','closed') OR NOT EXISTS(
      SELECT 1 FROM procurement_order source_order
      WHERE source_order.id=OLD.purchase_order_id AND source_order.status IN('ordered','completed')
    )) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Purchase total corrections require an ordered or completed purchase';
  END IF;
END;
