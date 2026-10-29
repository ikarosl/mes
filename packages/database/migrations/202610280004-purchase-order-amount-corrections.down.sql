-- Stop Procurement writers and roll back the matching application together.
-- Restore 003's tax-rate freeze without discarding existing amount or audit data.
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
