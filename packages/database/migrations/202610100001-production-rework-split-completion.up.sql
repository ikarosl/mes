-- Pause Production execution, abnormal and rework writes before switching applications.
-- Preserve only completion facts that already represent one pure result side.
-- A historical mixed completion cannot be split without inventing immutable report facts.
CREATE TEMPORARY TABLE guard_rework_split_up (ok TINYINT NOT NULL CHECK (ok=1));
INSERT INTO guard_rework_split_up SELECT IF(EXISTS (
  SELECT 1 FROM rework_records rw
  LEFT JOIN batch_step_reports source_report ON source_report.id=rw.source_report_id
  LEFT JOIN batch_step_abnormal_dispositions d ON d.id=rw.abnormal_disposition_id
  LEFT JOIN batch_step_reports completed_report ON completed_report.id=rw.completed_report_id
  WHERE source_report.id IS NULL
    OR rw.rework_quantity<=0
    OR source_report.production_batch_id<>rw.production_batch_id
    OR source_report.batch_step_record_id<>rw.batch_step_record_id
    OR source_report.report_type<>'normal'
    OR source_report.abnormal_quantity<>rw.rework_quantity
    OR source_report.unit_snapshot<>rw.unit_snapshot
    OR EXISTS (SELECT 1 FROM batch_step_reports reversal WHERE reversal.reversal_of_report_id=source_report.id)
    OR d.id IS NULL OR d.production_batch_id<>rw.production_batch_id
    OR d.batch_step_record_id<>rw.batch_step_record_id OR d.batch_step_report_id<>rw.source_report_id
    OR d.review_status<>'approved' OR NOT (d.disposition_type<=>'rework')
    OR rw.status NOT IN ('pending','doing','completed','cancelled')
    OR (rw.status<>'completed' AND rw.completed_report_id IS NOT NULL)
    OR (rw.status='completed' AND (
      completed_report.id IS NULL OR completed_report.id=rw.source_report_id
      OR completed_report.production_batch_id<>rw.production_batch_id
      OR completed_report.batch_step_record_id<>rw.batch_step_record_id
      OR completed_report.report_type<>'normal'
      OR completed_report.reversal_of_report_id IS NOT NULL
      OR completed_report.replaces_report_id IS NOT NULL
      OR completed_report.reported_quantity<>rw.rework_quantity
      OR completed_report.normal_quantity+completed_report.abnormal_quantity<>rw.rework_quantity
      OR completed_report.unit_snapshot<>rw.unit_snapshot
      OR EXISTS (SELECT 1 FROM batch_step_reports reversal WHERE reversal.reversal_of_report_id=completed_report.id)
      OR NOT (
        (completed_report.normal_quantity>0 AND completed_report.abnormal_quantity=0 AND completed_report.abnormal_origin IS NULL)
        OR (completed_report.normal_quantity=0 AND completed_report.abnormal_quantity>0 AND completed_report.abnormal_origin<=>'current_step')
      )
    ))
),0,1);
DROP TEMPORARY TABLE guard_rework_split_up;

ALTER TABLE rework_records
  DROP FOREIGN KEY fk_rework_records_completed_report,
  DROP CHECK chk_rework_records_state,
  DROP INDEX uk_rework_records_completed_report,
  DROP INDEX fk_rework_records_completed_report,
  RENAME COLUMN completed_report_id TO completed_normal_report_id,
  ADD COLUMN completed_abnormal_report_id BIGINT UNSIGNED NULL AFTER completed_normal_report_id;

UPDATE rework_records rw
JOIN batch_step_reports report ON report.id=rw.completed_normal_report_id
SET rw.completed_abnormal_report_id=rw.completed_normal_report_id,
    rw.completed_normal_report_id=NULL,rw.updated_at=rw.updated_at
WHERE report.normal_quantity=0 AND report.abnormal_quantity>0;

ALTER TABLE rework_records
  ADD UNIQUE KEY uk_rework_records_completed_normal_report (completed_normal_report_id),
  ADD UNIQUE KEY uk_rework_records_completed_abnormal_report (completed_abnormal_report_id),
  ADD KEY idx_rework_records_completed_normal_source (completed_normal_report_id,batch_step_record_id,production_batch_id),
  ADD KEY idx_rework_records_completed_abnormal_source (completed_abnormal_report_id,batch_step_record_id,production_batch_id),
  ADD CONSTRAINT fk_rework_records_completed_normal_report FOREIGN KEY (
    completed_normal_report_id,batch_step_record_id,production_batch_id
  ) REFERENCES batch_step_reports (id,batch_step_record_id,production_batch_id),
  ADD CONSTRAINT fk_rework_records_completed_abnormal_report FOREIGN KEY (
    completed_abnormal_report_id,batch_step_record_id,production_batch_id
  ) REFERENCES batch_step_reports (id,batch_step_record_id,production_batch_id),
  ADD CONSTRAINT chk_rework_records_result_distinct CHECK (
    completed_normal_report_id IS NULL OR completed_abnormal_report_id IS NULL
    OR completed_normal_report_id<>completed_abnormal_report_id
  ),
  ADD CONSTRAINT chk_rework_records_state CHECK (
    (status='pending' AND started_at IS NULL AND completed_at IS NULL
      AND completed_normal_report_id IS NULL AND completed_abnormal_report_id IS NULL)
    OR (status='doing' AND started_at IS NOT NULL AND completed_at IS NULL
      AND completed_normal_report_id IS NULL AND completed_abnormal_report_id IS NULL)
    OR (status='completed' AND started_at IS NOT NULL AND completed_at IS NOT NULL
      AND (completed_normal_report_id IS NOT NULL OR completed_abnormal_report_id IS NOT NULL))
    OR (status='cancelled' AND completed_at IS NULL
      AND completed_normal_report_id IS NULL AND completed_abnormal_report_id IS NULL)
  );
