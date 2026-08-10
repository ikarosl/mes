ALTER TABLE batch_step_records
  ADD COLUMN output_quantity DECIMAL(12,4) NOT NULL DEFAULT 0 AFTER completed_at,
  ADD COLUMN qualified_quantity DECIMAL(12,4) NOT NULL DEFAULT 0 AFTER output_quantity,
  ADD COLUMN abnormal_quantity DECIMAL(12,4) NOT NULL DEFAULT 0 AFTER qualified_quantity,
  ADD COLUMN rework_quantity DECIMAL(12,4) NOT NULL DEFAULT 0 AFTER abnormal_quantity;

UPDATE batch_step_records sr
LEFT JOIN (
  SELECT
    batch_step_record_id,
    SUM(CASE WHEN report_type = 'normal' THEN reported_quantity ELSE -reported_quantity END) AS reported_quantity,
    SUM(CASE WHEN report_type = 'normal' THEN normal_quantity ELSE -normal_quantity END) AS normal_quantity,
    SUM(CASE WHEN report_type = 'normal' THEN abnormal_quantity ELSE -abnormal_quantity END) AS abnormal_quantity
  FROM batch_step_reports
  GROUP BY batch_step_record_id
) summary ON summary.batch_step_record_id = sr.id
SET
  sr.output_quantity = COALESCE(summary.reported_quantity, 0),
  sr.qualified_quantity = COALESCE(summary.normal_quantity, 0),
  sr.abnormal_quantity = COALESCE(summary.abnormal_quantity, 0),
  sr.rework_quantity = 0;

ALTER TABLE batch_step_records
  ADD CONSTRAINT chk_batch_step_records_quantity CHECK (
    output_quantity >= 0
    AND qualified_quantity >= 0
    AND abnormal_quantity >= 0
    AND rework_quantity >= 0
    AND qualified_quantity + abnormal_quantity <= output_quantity
  );

DROP TABLE batch_step_reports;

ALTER TABLE batch_step_records
  DROP INDEX uk_batch_step_records_id_batch;

UPDATE permissions
SET name = '工序报工',
    api_method = 'PATCH',
    api_path = '/api/production/batches/:id/step-records/:recordId',
    sort_order = 224
WHERE code = 'production:steps:report';
