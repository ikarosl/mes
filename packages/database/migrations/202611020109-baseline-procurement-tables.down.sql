-- One-time 20261102 baseline: phase 1, procurement.
-- Final schema reproduced from all 118 historical migrations; later changes are append-only.

-- Refuse to remove schema protection or data while business/seed rows remain.
CREATE TEMPORARY TABLE tmp_baseline_0109_down_guard (
  has_data TINYINT NOT NULL,
  CONSTRAINT chk_baseline_0109_empty CHECK (has_data = 0)
) ENGINE=MEMORY;

INSERT INTO tmp_baseline_0109_down_guard (has_data)
SELECT 1
WHERE EXISTS (SELECT 1 FROM `procurement_order`)
   OR EXISTS (SELECT 1 FROM `procurement_order_line`)
   OR EXISTS (SELECT 1 FROM `procurement_order_line_source`)
   OR EXISTS (SELECT 1 FROM `procurement_receipt`)
   OR EXISTS (SELECT 1 FROM `procurement_receipt_acceptance`)
   OR EXISTS (SELECT 1 FROM `procurement_receipt_allocation`)
   OR EXISTS (SELECT 1 FROM `procurement_receipt_line`)
   OR EXISTS (SELECT 1 FROM `procurement_receipt_revision`)
   OR EXISTS (SELECT 1 FROM `procurement_receipt_round`)
   OR EXISTS (SELECT 1 FROM `procurement_supplier`)
   OR EXISTS (SELECT 1 FROM `procurement_supplier_return`);

DROP TEMPORARY TABLE tmp_baseline_0109_down_guard;

DROP TABLE `procurement_supplier_return`;
DROP TABLE `procurement_supplier`;
DROP TABLE `procurement_receipt_round`;
DROP TABLE `procurement_receipt_revision`;
DROP TABLE `procurement_receipt_line`;
DROP TABLE `procurement_receipt_allocation`;
DROP TABLE `procurement_receipt_acceptance`;
DROP TABLE `procurement_receipt`;
DROP TABLE `procurement_order_line_source`;
DROP TABLE `procurement_order_line`;
DROP TABLE `procurement_order`;
