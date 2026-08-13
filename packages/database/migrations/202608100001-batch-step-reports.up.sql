CREATE TEMPORARY TABLE tmp_batch_step_report_migration_guard (
  invalid_value TINYINT NOT NULL,
  CONSTRAINT chk_tmp_batch_step_report_migration_guard CHECK (invalid_value = 0)
);

INSERT INTO tmp_batch_step_report_migration_guard (invalid_value)
SELECT 1
FROM batch_step_records
WHERE output_quantity <> qualified_quantity + abnormal_quantity
   OR rework_quantity <> 0
   OR (output_quantity > 0 AND COALESCE(updated_by, created_by) IS NULL)
LIMIT 1;

DROP TEMPORARY TABLE tmp_batch_step_report_migration_guard;

ALTER TABLE batch_step_records
  ADD UNIQUE KEY uk_batch_step_records_id_batch (id, production_batch_id);

CREATE TABLE batch_step_reports (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  report_no VARCHAR(100) NOT NULL,
  production_batch_id BIGINT UNSIGNED NOT NULL,
  batch_step_record_id BIGINT UNSIGNED NOT NULL,
  report_type VARCHAR(20) NOT NULL DEFAULT 'normal',
  reversal_of_report_id BIGINT UNSIGNED NULL,
  replaces_report_id BIGINT UNSIGNED NULL,
  reported_quantity DECIMAL(12,4) NOT NULL,
  normal_quantity DECIMAL(12,4) NOT NULL,
  abnormal_quantity DECIMAL(12,4) NOT NULL,
  unit_snapshot VARCHAR(20) NOT NULL,
  remark TEXT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_batch_step_reports_no (report_no),
  UNIQUE KEY uk_batch_step_reports_reversal (reversal_of_report_id),
  UNIQUE KEY uk_batch_step_reports_replacement (replaces_report_id),
  UNIQUE KEY uk_batch_step_reports_reference (id, batch_step_record_id, production_batch_id),
  KEY idx_batch_step_reports_step_created (batch_step_record_id, created_at, id),
  KEY idx_batch_step_reports_batch_created (production_batch_id, created_at, id),
  CONSTRAINT chk_batch_step_reports_type CHECK (report_type IN ('normal', 'reversal')),
  CONSTRAINT chk_batch_step_reports_source CHECK (
    (report_type = 'normal' AND reversal_of_report_id IS NULL)
    OR (report_type = 'reversal' AND reversal_of_report_id IS NOT NULL AND replaces_report_id IS NULL)
  ),
  CONSTRAINT chk_batch_step_reports_quantity CHECK (
    reported_quantity > 0
    AND normal_quantity >= 0
    AND abnormal_quantity >= 0
    AND normal_quantity + abnormal_quantity = reported_quantity
  ),
  CONSTRAINT fk_batch_step_reports_step FOREIGN KEY (batch_step_record_id, production_batch_id)
    REFERENCES batch_step_records(id, production_batch_id),
  CONSTRAINT fk_batch_step_reports_reversal FOREIGN KEY (
    reversal_of_report_id,
    batch_step_record_id,
    production_batch_id
  ) REFERENCES batch_step_reports(id, batch_step_record_id, production_batch_id),
  CONSTRAINT fk_batch_step_reports_replacement FOREIGN KEY (
    replaces_report_id,
    batch_step_record_id,
    production_batch_id
  ) REFERENCES batch_step_reports(id, batch_step_record_id, production_batch_id),
  CONSTRAINT fk_batch_step_reports_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO batch_step_reports (
  report_no,
  production_batch_id,
  batch_step_record_id,
  report_type,
  reported_quantity,
  normal_quantity,
  abnormal_quantity,
  unit_snapshot,
  remark,
  created_by,
  created_at
)
SELECT
  CONCAT('LEGACY-SR-', id),
  production_batch_id,
  id,
  'normal',
  output_quantity,
  qualified_quantity,
  abnormal_quantity,
  unit_snapshot,
  '由 batch_step_records 历史累计数量迁移',
  COALESCE(updated_by, created_by),
  updated_at
FROM batch_step_records
WHERE output_quantity > 0;

ALTER TABLE batch_step_records
  DROP CHECK chk_batch_step_records_quantity,
  DROP COLUMN output_quantity,
  DROP COLUMN qualified_quantity,
  DROP COLUMN abnormal_quantity,
  DROP COLUMN rework_quantity;

UPDATE permissions
SET name = '工序报工',
    api_method = 'POST',
    api_path = '/api/production/batches/:batchId/step-records/:recordId/reports',
    sort_order = 225,
    status = 1,
    deleted_at = NULL
WHERE code = 'production:steps:report';
