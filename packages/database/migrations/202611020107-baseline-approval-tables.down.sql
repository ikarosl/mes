-- One-time 20261102 baseline: phase 1, approval.
-- Final schema reproduced from all 118 historical migrations; later changes are append-only.

-- Refuse to remove schema protection or data while business/seed rows remain.
CREATE TEMPORARY TABLE tmp_baseline_0107_down_guard (
  has_data TINYINT NOT NULL,
  CONSTRAINT chk_baseline_0107_empty CHECK (has_data = 0)
) ENGINE=MEMORY;

INSERT INTO tmp_baseline_0107_down_guard (has_data)
SELECT 1
WHERE EXISTS (SELECT 1 FROM `approval_actions`)
   OR EXISTS (SELECT 1 FROM `approval_flow_definitions`)
   OR EXISTS (SELECT 1 FROM `approval_flow_steps`)
   OR EXISTS (SELECT 1 FROM `approval_flow_versions`)
   OR EXISTS (SELECT 1 FROM `approval_instance_steps`)
   OR EXISTS (SELECT 1 FROM `approval_instances`);

DROP TEMPORARY TABLE tmp_baseline_0107_down_guard;

DROP TABLE `approval_instances`;
DROP TABLE `approval_instance_steps`;
DROP TABLE `approval_flow_versions`;
DROP TABLE `approval_flow_steps`;
DROP TABLE `approval_flow_definitions`;
DROP TABLE `approval_actions`;
