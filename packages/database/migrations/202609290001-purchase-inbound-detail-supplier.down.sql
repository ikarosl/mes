-- A header cannot represent different supplier snapshots on one purchased inbound order.
-- Refuse rollback before any DDL rather than selecting one supplier and discarding the others.
CREATE TEMPORARY TABLE guard_mixed_supplier_inbound_rollback (ok TINYINT NOT NULL CHECK(ok=1));
INSERT INTO guard_mixed_supplier_inbound_rollback
SELECT IF(EXISTS(
  SELECT 1 FROM inbound_detail first_detail
  JOIN inbound_detail second_detail ON second_detail.inbound_id=first_detail.inbound_id
    AND second_detail.id>first_detail.id
  JOIN inbound_order o ON o.id=first_detail.inbound_id AND o.source_type='purchased'
  WHERE NOT(first_detail.supplier_name_snapshot <=> second_detail.supplier_name_snapshot)
) OR EXISTS(
  SELECT 1 FROM inbound_detail d JOIN inbound_order o ON o.id=d.inbound_id
  WHERE o.source_type<>'purchased' AND d.supplier_name_snapshot IS NOT NULL
),0,1);
DROP TEMPORARY TABLE guard_mixed_supplier_inbound_rollback;

ALTER TABLE inbound_order
  DROP CHECK chk_inbound_order_finished_identity,
  ADD COLUMN provider VARCHAR(100) NULL AFTER source_type,
  ADD CONSTRAINT chk_inbound_order_finished_identity CHECK(
    (source_type='finished_product' AND product_id IS NOT NULL AND production_batch_id IS NOT NULL AND work_order_id IS NOT NULL AND provider IS NULL)
    OR (source_type<>'finished_product' AND product_id IS NULL));
UPDATE inbound_order o LEFT JOIN (
  SELECT inbound_id,MAX(supplier_name_snapshot) supplier_name_snapshot
  FROM inbound_detail GROUP BY inbound_id
) d ON d.inbound_id=o.id
  SET o.provider=d.supplier_name_snapshot WHERE o.source_type='purchased';
ALTER TABLE inbound_detail
  DROP CHECK chk_inbound_detail_supplier_snapshot,
  DROP COLUMN supplier_name_snapshot;
