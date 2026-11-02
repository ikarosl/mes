-- One-time 20261102 baseline: phase 1, quality.
-- Final schema reproduced from all 118 historical migrations; later changes are append-only.

-- Refuse to remove schema protection or data while business/seed rows remain.
CREATE TEMPORARY TABLE tmp_baseline_0110_down_guard (
  has_data TINYINT NOT NULL,
  CONSTRAINT chk_baseline_0110_empty CHECK (has_data = 0)
) ENGINE=MEMORY;

INSERT INTO tmp_baseline_0110_down_guard (has_data)
SELECT 1
WHERE EXISTS (SELECT 1 FROM `quality_incoming_inspection_order`)
   OR EXISTS (SELECT 1 FROM `quality_incoming_inspection_order_receipt`)
   OR EXISTS (SELECT 1 FROM `quality_inspection_case`)
   OR EXISTS (SELECT 1 FROM `quality_inspection_record`)
   OR EXISTS (SELECT 1 FROM `quality_process_inspection`)
   OR EXISTS (SELECT 1 FROM `quality_process_inspection_record`);

DROP TEMPORARY TABLE tmp_baseline_0110_down_guard;

DROP TABLE `quality_process_inspection_record`;
DROP TABLE `quality_process_inspection`;
DROP TABLE `quality_inspection_record`;
DROP TABLE `quality_inspection_case`;
DROP TABLE `quality_incoming_inspection_order_receipt`;
DROP TABLE `quality_incoming_inspection_order`;
