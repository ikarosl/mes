-- Never discard new amount values, correction evidence or command snapshots.
CREATE TEMPORARY TABLE guard_purchase_order_line_total_amounts_down (
  invalid_value TINYINT NOT NULL,
  CONSTRAINT chk_purchase_line_total_amounts_down_empty CHECK(invalid_value=0)
) ENGINE=MEMORY;
INSERT INTO guard_purchase_order_line_total_amounts_down
SELECT 1 WHERE EXISTS(SELECT 1 FROM procurement_order)
  OR EXISTS(SELECT 1 FROM procurement_order_line)
  OR EXISTS(SELECT 1 FROM procurement_receipt)
  OR EXISTS(SELECT 1 FROM inbound_detail WHERE procurement_receipt_line_id IS NOT NULL)
  OR EXISTS(SELECT 1 FROM http_idempotency_records)
  OR EXISTS(SELECT 1 FROM operation_logs WHERE module='procurement' AND action='purchase-order-line.correct-total-amount');
DROP TEMPORARY TABLE guard_purchase_order_line_total_amounts_down;

DROP TRIGGER trg_procurement_order_line_amounts_frozen;
ALTER TABLE procurement_order_line
  DROP CHECK chk_procurement_line_total_amount,
  DROP CHECK chk_procurement_line_tax_inclusive_price,
  DROP CHECK chk_procurement_line_tax_exclusive_price,
  DROP CHECK chk_procurement_line_tax_rate,
  DROP COLUMN total_amount_source,
  DROP COLUMN total_amount,
  DROP COLUMN tax_rate_percent;

-- Restore exactly the guard introduced by 202610280002.
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
