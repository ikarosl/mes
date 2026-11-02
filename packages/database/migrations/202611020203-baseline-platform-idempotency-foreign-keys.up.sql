-- One-time 20261102 baseline: phase 2, platform-idempotency.
-- Final schema reproduced from all 118 historical migrations; later changes are append-only.

ALTER TABLE `http_idempotency_records`
  ADD CONSTRAINT `fk_http_idempotency_actor` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`);
