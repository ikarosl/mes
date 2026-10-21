-- Preserve every existing purchased order's supplier text before removing the single-value header field.
-- A non-purchased provider, a purchased provider without a material detail, or a sourced
-- purchased detail without a historical provider cannot be moved losslessly.
CREATE TEMPORARY TABLE guard_inbound_supplier_snapshot (ok TINYINT NOT NULL CHECK(ok=1));
INSERT INTO guard_inbound_supplier_snapshot
SELECT IF(EXISTS(
  SELECT 1 FROM inbound_order o WHERE o.provider IS NOT NULL AND (
    o.source_type<>'purchased' OR NOT EXISTS(
      SELECT 1 FROM inbound_detail d WHERE d.inbound_id=o.id AND d.product_id IS NULL
    )
  ) OR EXISTS(
    SELECT 1 FROM inbound_detail d JOIN inbound_order o ON o.id=d.inbound_id
    WHERE o.source_type='purchased' AND o.provider IS NULL AND d.procurement_allocation_id IS NOT NULL
  )
),0,1);
DROP TEMPORARY TABLE guard_inbound_supplier_snapshot;

ALTER TABLE inbound_detail
  ADD COLUMN supplier_name_snapshot VARCHAR(100) NULL AFTER item_code_snapshot;
UPDATE inbound_detail d JOIN inbound_order o ON o.id=d.inbound_id
  SET d.supplier_name_snapshot=o.provider
  WHERE o.source_type='purchased' AND d.product_id IS NULL AND o.provider IS NOT NULL;
ALTER TABLE inbound_detail
  ADD CONSTRAINT chk_inbound_detail_supplier_snapshot CHECK(
    (product_id IS NULL OR supplier_name_snapshot IS NULL)
    AND (procurement_allocation_id IS NULL OR supplier_name_snapshot IS NOT NULL));

ALTER TABLE inbound_order
  DROP CHECK chk_inbound_order_finished_identity,
  DROP COLUMN provider,
  ADD CONSTRAINT chk_inbound_order_finished_identity CHECK(
    (source_type='finished_product' AND product_id IS NOT NULL AND production_batch_id IS NOT NULL AND work_order_id IS NOT NULL)
    OR (source_type<>'finished_product' AND product_id IS NULL));
