-- One-time 20261102 baseline: phase 2, platform-audit.
-- Final schema reproduced from all 118 historical migrations; later changes are append-only.

ALTER TABLE `operation_logs`
  ADD CONSTRAINT `fk_operation_logs_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;
