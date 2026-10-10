-- Keep Production writes paused and switch back to the matching application.
-- Two independent result reports cannot be collapsed into an invented historical mixed fact.
CREATE TEMPORARY TABLE guard_rework_split_down (ok TINYINT NOT NULL CHECK (ok=1));
INSERT INTO guard_rework_split_down SELECT IF(EXISTS (
  SELECT 1 FROM rework_records rw
  LEFT JOIN batch_step_reports normal_report ON normal_report.id=rw.completed_normal_report_id
  LEFT JOIN batch_step_reports abnormal_report ON abnormal_report.id=rw.completed_abnormal_report_id
  WHERE (rw.completed_normal_report_id IS NOT NULL AND rw.completed_abnormal_report_id IS NOT NULL)
    OR rw.rework_quantity<=0
    OR (rw.status<>'completed' AND (rw.completed_normal_report_id IS NOT NULL OR rw.completed_abnormal_report_id IS NOT NULL))
    OR (rw.status='completed' AND (
      (rw.completed_normal_report_id IS NULL AND rw.completed_abnormal_report_id IS NULL)
      OR (rw.completed_normal_report_id IS NOT NULL AND (
        normal_report.id IS NULL OR normal_report.id=rw.source_report_id
        OR normal_report.production_batch_id<>rw.production_batch_id
        OR normal_report.batch_step_record_id<>rw.batch_step_record_id
        OR normal_report.report_type<>'normal'
        OR normal_report.reversal_of_report_id IS NOT NULL OR normal_report.replaces_report_id IS NOT NULL
        OR normal_report.normal_quantity<>rw.rework_quantity OR normal_report.abnormal_quantity<>0
        OR normal_report.reported_quantity<>rw.rework_quantity OR normal_report.abnormal_origin IS NOT NULL
        OR normal_report.unit_snapshot<>rw.unit_snapshot
        OR EXISTS (SELECT 1 FROM batch_step_reports reversal WHERE reversal.reversal_of_report_id=normal_report.id)
      ))
      OR (rw.completed_abnormal_report_id IS NOT NULL AND (
        abnormal_report.id IS NULL OR abnormal_report.id=rw.source_report_id
        OR abnormal_report.production_batch_id<>rw.production_batch_id
        OR abnormal_report.batch_step_record_id<>rw.batch_step_record_id
        OR abnormal_report.report_type<>'normal'
        OR abnormal_report.reversal_of_report_id IS NOT NULL OR abnormal_report.replaces_report_id IS NOT NULL
        OR abnormal_report.normal_quantity<>0 OR abnormal_report.abnormal_quantity<>rw.rework_quantity
        OR abnormal_report.reported_quantity<>rw.rework_quantity OR NOT (abnormal_report.abnormal_origin<=>'current_step')
        OR abnormal_report.unit_snapshot<>rw.unit_snapshot
        OR EXISTS (SELECT 1 FROM batch_step_reports reversal WHERE reversal.reversal_of_report_id=abnormal_report.id)
      ))
    ))
),0,1);
DROP TEMPORARY TABLE guard_rework_split_down;

ALTER TABLE rework_records
  DROP FOREIGN KEY fk_rework_records_completed_normal_report,
  DROP FOREIGN KEY fk_rework_records_completed_abnormal_report,
  DROP CHECK chk_rework_records_state,
  DROP CHECK chk_rework_records_result_distinct,
  DROP INDEX uk_rework_records_completed_normal_report,
  DROP INDEX uk_rework_records_completed_abnormal_report,
  DROP INDEX idx_rework_records_completed_normal_source,
  DROP INDEX idx_rework_records_completed_abnormal_source,
  RENAME COLUMN completed_normal_report_id TO completed_report_id;

UPDATE rework_records
SET completed_report_id=completed_abnormal_report_id,updated_at=updated_at
WHERE completed_abnormal_report_id IS NOT NULL;

ALTER TABLE rework_records
  DROP COLUMN completed_abnormal_report_id,
  ADD UNIQUE KEY uk_rework_records_completed_report (completed_report_id),
  ADD KEY fk_rework_records_completed_report (completed_report_id,batch_step_record_id,production_batch_id),
  ADD CONSTRAINT fk_rework_records_completed_report FOREIGN KEY (
    completed_report_id,batch_step_record_id,production_batch_id
  ) REFERENCES batch_step_reports (id,batch_step_record_id,production_batch_id),
  ADD CONSTRAINT chk_rework_records_state CHECK (
    (status='pending' AND started_at IS NULL AND completed_at IS NULL AND completed_report_id IS NULL)
    OR (status='doing' AND started_at IS NOT NULL AND completed_at IS NULL AND completed_report_id IS NULL)
    OR (status='completed' AND started_at IS NOT NULL AND completed_at IS NOT NULL AND completed_report_id IS NOT NULL)
    OR (status='cancelled' AND completed_at IS NULL AND completed_report_id IS NULL)
  );
