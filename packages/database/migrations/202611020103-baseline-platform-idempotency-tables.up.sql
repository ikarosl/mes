-- One-time 20261102 baseline: phase 1, platform-idempotency.
-- Final schema reproduced from all 118 historical migrations; later changes are append-only.

CREATE TABLE `http_idempotency_records` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `scope` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `idempotency_key` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `request_fingerprint` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `actor_id` bigint unsigned NOT NULL,
  `initial_request_id` varchar(128) NOT NULL,
  `status` varchar(16) NOT NULL,
  `result_json` json DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at` datetime DEFAULT NULL,
  `expires_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_http_idempotency_scope_key` (`scope`,`idempotency_key`),
  KEY `idx_http_idempotency_expires_at` (`expires_at`),
  KEY `idx_http_idempotency_initial_request` (`initial_request_id`),
  KEY `fk_http_idempotency_actor` (`actor_id`),
  CONSTRAINT `chk_http_idempotency_completed` CHECK ((((`status` = _utf8mb4'completed') and (`result_json` is not null) and (`completed_at` is not null) and (`expires_at` is not null)) or ((`status` = _utf8mb4'processing') and (`result_json` is null) and (`completed_at` is null) and (`expires_at` is null)))),
  CONSTRAINT `chk_http_idempotency_status` CHECK ((`status` in (_utf8mb4'processing',_utf8mb4'completed')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
