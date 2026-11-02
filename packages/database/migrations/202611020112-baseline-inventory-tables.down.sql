-- One-time 20261102 baseline: phase 1, inventory.
-- Final schema reproduced from all 118 historical migrations; later changes are append-only.

-- Refuse to remove schema protection or data while business/seed rows remain.
CREATE TEMPORARY TABLE tmp_baseline_0112_down_guard (
  has_data TINYINT NOT NULL,
  CONSTRAINT chk_baseline_0112_empty CHECK (has_data = 0)
) ENGINE=MEMORY;

INSERT INTO tmp_baseline_0112_down_guard (has_data)
SELECT 1
WHERE EXISTS (SELECT 1 FROM `inbound_detail`)
   OR EXISTS (SELECT 1 FROM `inbound_order`)
   OR EXISTS (SELECT 1 FROM `inventory_batch_balance`)
   OR EXISTS (SELECT 1 FROM `inventory_material_variant_balance`)
   OR EXISTS (SELECT 1 FROM `inventory_transaction`)
   OR EXISTS (SELECT 1 FROM `item_batch`)
   OR EXISTS (SELECT 1 FROM `outbound_detail`)
   OR EXISTS (SELECT 1 FROM `outbound_order`)
   OR EXISTS (SELECT 1 FROM `stock_check_detail`)
   OR EXISTS (SELECT 1 FROM `stock_check_order`);

DROP TEMPORARY TABLE tmp_baseline_0112_down_guard;

DROP TABLE `stock_check_order`;
DROP TABLE `stock_check_detail`;
DROP TABLE `outbound_order`;
DROP TABLE `outbound_detail`;
DROP TABLE `item_batch`;
DROP TABLE `inventory_transaction`;
DROP TABLE `inventory_material_variant_balance`;
DROP TABLE `inventory_batch_balance`;
DROP TABLE `inbound_order`;
DROP TABLE `inbound_detail`;
