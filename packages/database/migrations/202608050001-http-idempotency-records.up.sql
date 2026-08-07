CREATE TABLE http_idempotency_records (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  scope VARCHAR(128) NOT NULL COLLATE utf8mb4_bin,
  idempotency_key VARCHAR(150) NOT NULL COLLATE utf8mb4_bin,
  request_fingerprint CHAR(64) NOT NULL COLLATE ascii_bin,
  actor_id BIGINT UNSIGNED NOT NULL,
  initial_request_id VARCHAR(128) NOT NULL,
  status VARCHAR(16) NOT NULL,
  result_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  expires_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_http_idempotency_scope_key (scope, idempotency_key),
  KEY idx_http_idempotency_expires_at (expires_at),
  KEY idx_http_idempotency_initial_request (initial_request_id),
  CONSTRAINT chk_http_idempotency_status CHECK (status IN ('processing', 'completed')),
  CONSTRAINT chk_http_idempotency_completed CHECK (
    (status = 'completed' AND result_json IS NOT NULL AND completed_at IS NOT NULL AND expires_at IS NOT NULL)
    OR (status = 'processing' AND result_json IS NULL AND completed_at IS NULL AND expires_at IS NULL)
  ),
  CONSTRAINT fk_http_idempotency_actor FOREIGN KEY (actor_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
