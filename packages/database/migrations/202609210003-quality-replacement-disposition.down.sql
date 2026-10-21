-- A disposition can precede return or cover multiple handovers; never invent one legacy return ID.
CREATE TEMPORARY TABLE guard_quality_replacement_disposition (ok TINYINT NOT NULL CHECK(ok=1));
INSERT INTO guard_quality_replacement_disposition
SELECT IF(EXISTS(SELECT 1 FROM procurement_order_line WHERE origin_acceptance_line_id IS NOT NULL),0,1);
DROP TEMPORARY TABLE guard_quality_replacement_disposition;
ALTER TABLE procurement_order_line
  DROP FOREIGN KEY fk_procurement_order_origin_acceptance,
  DROP CHECK chk_procurement_order_quality_source,
  DROP CHECK chk_procurement_order_existing_receipt,
  DROP COLUMN origin_acceptance_line_id,
  ADD COLUMN origin_supplier_return_id BIGINT UNSIGNED NULL AFTER origin_receipt_line_id,
  ADD CONSTRAINT fk_purchase_order_line_origin_return
    FOREIGN KEY(origin_supplier_return_id,origin_receipt_line_id)
    REFERENCES procurement_supplier_return(id,receipt_line_id),
  ADD CONSTRAINT chk_purchase_order_line_return_source CHECK(origin_supplier_return_id IS NULL OR origin_receipt_line_id IS NOT NULL),
  ADD CONSTRAINT chk_procurement_order_existing_receipt CHECK(fulfillment_mode<>'existing_receipt' OR
    (origin_order_line_id IS NOT NULL AND origin_receipt_line_id IS NOT NULL AND origin_supplier_return_id IS NULL));
