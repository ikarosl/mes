-- One-time 20261102 baseline: phase 1, notification.
-- Final schema reproduced from all 118 historical migrations; later changes are append-only.

-- Refuse to remove schema protection or data while business/seed rows remain.
CREATE TEMPORARY TABLE tmp_baseline_0108_down_guard (
  has_data TINYINT NOT NULL,
  CONSTRAINT chk_baseline_0108_empty CHECK (has_data = 0)
) ENGINE=MEMORY;

INSERT INTO tmp_baseline_0108_down_guard (has_data)
SELECT 1
WHERE EXISTS (SELECT 1 FROM `notification_recipients`)
   OR EXISTS (SELECT 1 FROM `notifications`);

DROP TEMPORARY TABLE tmp_baseline_0108_down_guard;

DROP TABLE `notifications`;
DROP TABLE `notification_recipients`;
