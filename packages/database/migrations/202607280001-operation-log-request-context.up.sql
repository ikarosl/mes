ALTER TABLE operation_logs
  ADD COLUMN request_id VARCHAR(128) NULL AFTER ip,
  ADD COLUMN http_method VARCHAR(16) NULL AFTER request_id,
  ADD COLUMN route VARCHAR(255) NULL AFTER http_method,
  ADD COLUMN http_status SMALLINT UNSIGNED NULL AFTER route,
  ADD COLUMN duration_ms INT UNSIGNED NULL AFTER http_status,
  ADD COLUMN user_agent VARCHAR(512) NULL AFTER duration_ms,
  ADD COLUMN error_code VARCHAR(64) NULL AFTER user_agent,
  ADD KEY idx_operation_logs_request_id (request_id);
