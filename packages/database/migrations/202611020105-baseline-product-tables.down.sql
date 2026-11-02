-- One-time 20261102 baseline: phase 1, product.
-- Final schema reproduced from all 118 historical migrations; later changes are append-only.

-- Refuse to remove schema protection or data while business/seed rows remain.
CREATE TEMPORARY TABLE tmp_baseline_0105_down_guard (
  has_data TINYINT NOT NULL,
  CONSTRAINT chk_baseline_0105_empty CHECK (has_data = 0)
) ENGINE=MEMORY;

INSERT INTO tmp_baseline_0105_down_guard (has_data)
SELECT 1
WHERE EXISTS (SELECT 1 FROM `item_categories`)
   OR EXISTS (SELECT 1 FROM `material_variants`)
   OR EXISTS (SELECT 1 FROM `materials`)
   OR EXISTS (SELECT 1 FROM `process_route_steps`)
   OR EXISTS (SELECT 1 FROM `process_routes`)
   OR EXISTS (SELECT 1 FROM `process_steps`)
   OR EXISTS (SELECT 1 FROM `product_materials`)
   OR EXISTS (SELECT 1 FROM `products`)
   OR EXISTS (SELECT 1 FROM `technical_files`);

DROP TEMPORARY TABLE tmp_baseline_0105_down_guard;

DROP TABLE `technical_files`;
DROP TABLE `products`;
DROP TABLE `product_materials`;
DROP TABLE `process_steps`;
DROP TABLE `process_routes`;
DROP TABLE `process_route_steps`;
DROP TABLE `materials`;
DROP TABLE `material_variants`;
DROP TABLE `item_categories`;
