-- A receipt can contain several historical quality-return allocations.
-- Refuse rollback while quality supplements exist instead of guessing a link.
CREATE TEMPORARY TABLE guard_quality_supplement_receipt_rollback (ok TINYINT NOT NULL CHECK(ok=1));
INSERT INTO guard_quality_supplement_receipt_rollback
SELECT IF(EXISTS(
  SELECT 1 FROM procurement_order_line line
  JOIN procurement_order orders ON orders.id=line.purchase_order_id
  WHERE orders.supplement_reason='quality_replacement'),0,1);
DROP TEMPORARY TABLE guard_quality_supplement_receipt_rollback;

ALTER TABLE procurement_order_line
  DROP CHECK chk_procurement_order_supplement_receipt,
  DROP CHECK chk_procurement_order_existing_receipt,
  ADD COLUMN origin_allocation_id BIGINT UNSIGNED NULL AFTER origin_receipt_line_id,
  ADD INDEX fk_order_origin_allocation(origin_allocation_id,origin_receipt_line_id),
  ADD CONSTRAINT fk_order_origin_allocation FOREIGN KEY(origin_allocation_id,origin_receipt_line_id)
    REFERENCES procurement_receipt_allocation(id,receipt_line_id),
  ADD CONSTRAINT chk_procurement_order_quality_source CHECK(
    origin_allocation_id IS NULL
    OR (origin_receipt_line_id IS NOT NULL AND origin_order_line_id IS NOT NULL AND fulfillment_mode='new_arrival')),
  ADD CONSTRAINT chk_procurement_order_existing_receipt CHECK(
    fulfillment_mode<>'existing_receipt'
    OR (origin_order_line_id IS NOT NULL AND origin_receipt_line_id IS NOT NULL AND origin_allocation_id IS NULL));
