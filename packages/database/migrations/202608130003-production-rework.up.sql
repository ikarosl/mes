ALTER TABLE batch_step_abnormal_dispositions
  ADD UNIQUE KEY uk_batch_step_abnormal_dispositions_source (
    id,
    production_batch_id,
    batch_step_record_id,
    batch_step_report_id
  );

CREATE TABLE rework_records (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  rework_no VARCHAR(100) NOT NULL,
  abnormal_disposition_id BIGINT UNSIGNED NOT NULL,
  production_batch_id BIGINT UNSIGNED NOT NULL,
  batch_step_record_id BIGINT UNSIGNED NOT NULL,
  source_report_id BIGINT UNSIGNED NOT NULL,
  responsible_user_id BIGINT UNSIGNED NOT NULL,
  rework_quantity DECIMAL(12,4) NOT NULL,
  unit_snapshot VARCHAR(20) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  completed_report_id BIGINT UNSIGNED NULL,
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  version INT NOT NULL DEFAULT 0,
  remark TEXT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_rework_records_no (rework_no),
  UNIQUE KEY uk_rework_records_disposition (abnormal_disposition_id),
  UNIQUE KEY uk_rework_records_completed_report (completed_report_id),
  KEY idx_rework_records_assignee_status (responsible_user_id, status, created_at),
  KEY idx_rework_records_batch_status (production_batch_id, status, created_at),
  CONSTRAINT chk_rework_records_quantity CHECK (rework_quantity > 0),
  CONSTRAINT chk_rework_records_status CHECK (
    status IN ('pending', 'doing', 'completed', 'cancelled')
  ),
  CONSTRAINT chk_rework_records_version CHECK (version >= 0),
  CONSTRAINT chk_rework_records_state CHECK (
    (
      status = 'pending'
      AND started_at IS NULL
      AND completed_at IS NULL
      AND completed_report_id IS NULL
    )
    OR
    (
      status = 'doing'
      AND started_at IS NOT NULL
      AND completed_at IS NULL
      AND completed_report_id IS NULL
    )
    OR
    (
      status = 'completed'
      AND started_at IS NOT NULL
      AND completed_at IS NOT NULL
      AND completed_report_id IS NOT NULL
    )
    OR
    (
      status = 'cancelled'
      AND completed_at IS NULL
      AND completed_report_id IS NULL
    )
  ),
  CONSTRAINT fk_rework_records_disposition_source FOREIGN KEY (
    abnormal_disposition_id,
    production_batch_id,
    batch_step_record_id,
    source_report_id
  ) REFERENCES batch_step_abnormal_dispositions (
    id,
    production_batch_id,
    batch_step_record_id,
    batch_step_report_id
  ),
  CONSTRAINT fk_rework_records_step FOREIGN KEY (
    batch_step_record_id,
    production_batch_id
  ) REFERENCES batch_step_records (id, production_batch_id),
  CONSTRAINT fk_rework_records_source_report FOREIGN KEY (
    source_report_id,
    batch_step_record_id,
    production_batch_id
  ) REFERENCES batch_step_reports (id, batch_step_record_id, production_batch_id),
  CONSTRAINT fk_rework_records_completed_report FOREIGN KEY (
    completed_report_id,
    batch_step_record_id,
    production_batch_id
  ) REFERENCES batch_step_reports (id, batch_step_record_id, production_batch_id),
  CONSTRAINT fk_rework_records_responsible_user FOREIGN KEY (responsible_user_id)
    REFERENCES users (id),
  CONSTRAINT fk_rework_records_created_by FOREIGN KEY (created_by) REFERENCES users (id),
  CONSTRAINT fk_rework_records_updated_by FOREIGN KEY (updated_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO permissions (parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
SELECT id, '审批生产异常', 'production:steps:manage-abnormal', 'api', NULL, 'POST', '/api/production/abnormal-dispositions/:dispositionId/actions/*', 233, 1
FROM permissions WHERE code = 'production:view'
UNION ALL
SELECT id, '执行生产返工', 'production:rework:execute', 'api', NULL, 'POST', '/api/production/reworks/:reworkId/actions/*', 234, 1
FROM permissions WHERE code = 'production:view'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name = VALUES(name),
  type = VALUES(type),
  route_path = VALUES(route_path),
  api_method = VALUES(api_method),
  api_path = VALUES(api_path),
  sort_order = VALUES(sort_order),
  status = 1,
  deleted_at = NULL;
