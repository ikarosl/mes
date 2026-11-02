-- One-time 20261102 baseline: phase 1, identity.
-- Final schema reproduced from all 118 historical migrations; later changes are append-only.

-- Refuse to remove schema protection or data while business/seed rows remain.
CREATE TEMPORARY TABLE tmp_baseline_0101_down_guard (
  has_data TINYINT NOT NULL,
  CONSTRAINT chk_baseline_0101_empty CHECK (has_data = 0)
) ENGINE=MEMORY;

INSERT INTO tmp_baseline_0101_down_guard (has_data)
SELECT 1
WHERE EXISTS (SELECT 1 FROM `departments`)
   OR EXISTS (SELECT 1 FROM `permissions`)
   OR EXISTS (SELECT 1 FROM `refresh_tokens`)
   OR EXISTS (SELECT 1 FROM `role_permissions`)
   OR EXISTS (SELECT 1 FROM `roles`)
   OR EXISTS (SELECT 1 FROM `user_candidate_config_roles`)
   OR EXISTS (SELECT 1 FROM `user_candidate_configs`)
   OR EXISTS (SELECT 1 FROM `user_roles`)
   OR EXISTS (SELECT 1 FROM `users`);

DROP TEMPORARY TABLE tmp_baseline_0101_down_guard;

DROP TABLE `users`;
DROP TABLE `user_roles`;
DROP TABLE `user_candidate_configs`;
DROP TABLE `user_candidate_config_roles`;
DROP TABLE `roles`;
DROP TABLE `role_permissions`;
DROP TABLE `refresh_tokens`;
DROP TABLE `permissions`;
DROP TABLE `departments`;
