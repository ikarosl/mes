INSERT INTO batch_step_reports (
  report_no,
  production_batch_id,
  batch_step_record_id,
  report_type,
  reversal_of_report_id,
  replaces_report_id,
  reported_quantity,
  normal_quantity,
  abnormal_quantity,
  abnormal_origin,
  unit_snapshot,
  remark,
  created_by,
  created_at
)
SELECT
  CONCAT('LEGACY-REJECT-REV-', disposition.id),
  source_report.production_batch_id,
  source_report.batch_step_record_id,
  'reversal',
  source_report.id,
  NULL,
  source_report.reported_quantity,
  source_report.normal_quantity,
  source_report.abnormal_quantity,
  source_report.abnormal_origin,
  source_report.unit_snapshot,
  disposition.remark,
  disposition.reviewed_by,
  disposition.reviewed_at
FROM batch_step_abnormal_dispositions disposition
JOIN batch_step_reports source_report
  ON source_report.id = disposition.batch_step_report_id
LEFT JOIN batch_step_reports existing_reversal
  ON existing_reversal.reversal_of_report_id = source_report.id
LEFT JOIN rework_records completed_rework
  ON completed_rework.completed_report_id = source_report.id
WHERE disposition.review_status = 'rejected'
  AND source_report.report_type = 'normal'
  AND source_report.replaces_report_id IS NULL
  AND source_report.normal_quantity = 0
  AND source_report.abnormal_quantity > 0
  AND existing_reversal.id IS NULL
  AND completed_rework.id IS NULL;
