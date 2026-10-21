-- Pause Procurement order/supplement writers and switch to the matching API.
-- Remove only the purchasing-side allocation reference. Receipt, allocation,
-- return, inbound, inventory and platform audit/idempotency facts stay intact.
ALTER TABLE procurement_order_line
  DROP FOREIGN KEY fk_order_origin_allocation,
  DROP CHECK chk_procurement_order_quality_source,
  DROP CHECK chk_procurement_order_existing_receipt,
  DROP INDEX fk_order_origin_allocation,
  DROP COLUMN origin_allocation_id,
  ADD CONSTRAINT chk_procurement_order_supplement_receipt CHECK(
    (origin_order_line_id IS NULL AND origin_receipt_line_id IS NULL)
    OR (origin_order_line_id IS NOT NULL AND origin_receipt_line_id IS NOT NULL)),
  ADD CONSTRAINT chk_procurement_order_existing_receipt CHECK(
    fulfillment_mode<>'existing_receipt'
    OR (origin_order_line_id IS NOT NULL AND origin_receipt_line_id IS NOT NULL));
