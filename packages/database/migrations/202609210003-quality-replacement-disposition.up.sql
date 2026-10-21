-- Quality replacement traces the warehouse disposition, independently of physical return timing.
ALTER TABLE procurement_order_line
  ADD COLUMN origin_acceptance_line_id BIGINT UNSIGNED NULL AFTER origin_receipt_line_id;
UPDATE procurement_order_line l
JOIN procurement_supplier_return r ON r.id=l.origin_supplier_return_id
SET l.origin_acceptance_line_id=r.acceptance_line_id;
ALTER TABLE procurement_order_line
  DROP FOREIGN KEY fk_purchase_order_line_origin_return,
  DROP CHECK chk_purchase_order_line_return_source,
  DROP CHECK chk_procurement_order_existing_receipt,
  DROP COLUMN origin_supplier_return_id,
  ADD CONSTRAINT fk_procurement_order_origin_acceptance
    FOREIGN KEY(origin_acceptance_line_id,origin_receipt_line_id)
    REFERENCES procurement_receipt_acceptance_line(id,receipt_line_id),
  ADD CONSTRAINT chk_procurement_order_quality_source CHECK(origin_acceptance_line_id IS NULL OR
    (origin_receipt_line_id IS NOT NULL AND origin_order_line_id IS NOT NULL AND fulfillment_mode='new_arrival')),
  ADD CONSTRAINT chk_procurement_order_existing_receipt CHECK(fulfillment_mode<>'existing_receipt' OR
    (origin_order_line_id IS NOT NULL AND origin_receipt_line_id IS NOT NULL AND origin_acceptance_line_id IS NULL));
