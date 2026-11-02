-- One-time 20261102 baseline: phase 1, platform-audit.
-- Final schema reproduced from all 118 historical migrations; later changes are append-only.

CREATE TABLE `operation_logs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `log_type` varchar(32) NOT NULL,
  `module` varchar(64) NOT NULL,
  `action` varchar(128) NOT NULL,
  `user_id` bigint unsigned DEFAULT NULL,
  `target_id` bigint unsigned DEFAULT NULL,
  `target_type` varchar(64) DEFAULT NULL,
  `result` varchar(32) NOT NULL DEFAULT 'success',
  `before_data` json DEFAULT NULL,
  `after_data` json DEFAULT NULL,
  `ip` varchar(64) DEFAULT NULL,
  `request_id` varchar(128) DEFAULT NULL,
  `http_method` varchar(16) DEFAULT NULL,
  `route` varchar(255) DEFAULT NULL,
  `http_status` smallint unsigned DEFAULT NULL,
  `duration_ms` int unsigned DEFAULT NULL,
  `user_agent` varchar(512) DEFAULT NULL,
  `error_code` varchar(64) DEFAULT NULL,
  `remark` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_operation_logs_user_time` (`user_id`,`created_at`),
  KEY `idx_operation_logs_module_action_time` (`module`,`action`,`created_at`),
  KEY `idx_operation_logs_request_id` (`request_id`),
  CONSTRAINT `chk_operation_logs_result` CHECK ((`result` in (_utf8mb4'success',_utf8mb4'failed')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
