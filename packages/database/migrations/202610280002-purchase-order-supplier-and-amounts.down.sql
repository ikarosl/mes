-- Reverting a header supplier and free text amounts is only safe with no
-- purchase business or idempotent command snapshots. Never discard real rows.
CREATE TEMPORARY TABLE guard_purchase_order_supplier_and_amounts_down (
  invalid_value TINYINT NOT NULL,
  CONSTRAINT chk_purchase_supplier_amounts_down_empty CHECK(invalid_value=0)
) ENGINE=MEMORY;
INSERT INTO guard_purchase_order_supplier_and_amounts_down
SELECT 1 WHERE EXISTS(SELECT 1 FROM procurement_order)
  OR EXISTS(SELECT 1 FROM procurement_order_line)
  OR EXISTS(SELECT 1 FROM procurement_receipt)
  OR EXISTS(SELECT 1 FROM inbound_detail WHERE procurement_receipt_line_id IS NOT NULL)
  OR EXISTS(SELECT 1 FROM http_idempotency_records);
DROP TEMPORARY TABLE guard_purchase_order_supplier_and_amounts_down;

-- Neither of these purchase UPDATE triggers existed before this migration.
-- Inventory's current inbound guards do not reference the removed line supplier.
DROP TRIGGER trg_procurement_order_line_amounts_frozen;
DROP TRIGGER trg_procurement_order_supplier_frozen;

ALTER TABLE procurement_order_line
  DROP INDEX uk_procurement_order_line_identity,
  DROP COLUMN tax_inclusive_amount,
  DROP COLUMN tax_exclusive_amount,
  ADD COLUMN supplier_id BIGINT UNSIGNED NOT NULL AFTER line_no,
  ADD UNIQUE KEY uk_procurement_order_line_identity(purchase_order_id,item_id,material_variant_id,supplier_id),
  ADD KEY idx_procurement_order_line_supplier(supplier_id,purchase_order_id,id),
  ADD CONSTRAINT fk_procurement_order_line_supplier FOREIGN KEY(supplier_id) REFERENCES procurement_supplier(id);

ALTER TABLE procurement_order
  DROP FOREIGN KEY fk_procurement_order_supplier,
  DROP INDEX idx_procurement_order_supplier,
  DROP COLUMN supplier_id;
