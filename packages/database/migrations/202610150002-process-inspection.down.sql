-- Do not discard inspections or any downstream inspection quantity facts.
CREATE TEMPORARY TABLE guard_process_inspection_down(ok TINYINT NOT NULL CHECK(ok=1));
INSERT INTO guard_process_inspection_down SELECT IF(EXISTS(SELECT 1 FROM quality_process_inspection) OR EXISTS(SELECT 1 FROM quality_process_inspection_record) OR EXISTS(SELECT 1 FROM batch_step_abnormal_dispositions WHERE source_type='process_inspection') OR EXISTS(SELECT 1 FROM batch_step_reports WHERE quantity_scope='inspection') OR EXISTS(SELECT 1 FROM rework_records WHERE source_report_id IS NULL) OR EXISTS(SELECT 1 FROM batch_step_scrap_records WHERE source_report_id IS NULL) OR EXISTS(SELECT 1 FROM production_scrap_supplement_plan WHERE source_report_id IS NULL),0,1);
DROP TEMPORARY TABLE guard_process_inspection_down;
ALTER TABLE rework_records DROP FOREIGN KEY fk_rework_disposition_step, DROP FOREIGN KEY fk_rework_records_disposition_source, DROP FOREIGN KEY fk_rework_records_source_report;
ALTER TABLE batch_step_scrap_records DROP FOREIGN KEY fk_step_scrap_disposition_step, DROP FOREIGN KEY fk_batch_step_scrap_records_disposition_source;
ALTER TABLE production_scrap_supplement_plan DROP FOREIGN KEY fk_scrap_plan_disposition_step, DROP FOREIGN KEY fk_production_scrap_supplement_plan_disposition;
ALTER TABLE batch_step_abnormal_dispositions
  DROP FOREIGN KEY fk_abnormal_disposition_step,
  DROP FOREIGN KEY fk_abnormal_disposition_inspection,
  DROP FOREIGN KEY fk_abnormal_disposition_inspection_record,
  DROP FOREIGN KEY fk_batch_step_abnormal_dispositions_report,
  DROP CHECK chk_abnormal_disposition_source,
  DROP INDEX uk_abnormal_disposition_step,
  DROP INDEX idx_abnormal_disposition_step_source,
  DROP INDEX idx_abnormal_disposition_inspection,
  DROP INDEX idx_abnormal_disposition_inspection_record,
  DROP COLUMN source_type,
  DROP COLUMN process_inspection_id,
  DROP COLUMN process_inspection_record_id,
  DROP COLUMN inspection_quantity,
  DROP COLUMN unit_snapshot,
  MODIFY COLUMN batch_step_report_id BIGINT UNSIGNED NOT NULL;
ALTER TABLE batch_step_abnormal_dispositions
  ADD CONSTRAINT fk_batch_step_abnormal_dispositions_report FOREIGN KEY(batch_step_report_id,batch_step_record_id,production_batch_id) REFERENCES batch_step_reports(id,batch_step_record_id,production_batch_id);
ALTER TABLE rework_records
  MODIFY COLUMN source_report_id BIGINT UNSIGNED NOT NULL,
  ADD CONSTRAINT fk_rework_records_disposition_source FOREIGN KEY(abnormal_disposition_id,production_batch_id,batch_step_record_id,source_report_id) REFERENCES batch_step_abnormal_dispositions(id,production_batch_id,batch_step_record_id,batch_step_report_id),
  ADD CONSTRAINT fk_rework_records_source_report FOREIGN KEY(source_report_id,batch_step_record_id,production_batch_id) REFERENCES batch_step_reports(id,batch_step_record_id,production_batch_id);
ALTER TABLE batch_step_scrap_records
  MODIFY COLUMN source_report_id BIGINT UNSIGNED NOT NULL,
  ADD CONSTRAINT fk_batch_step_scrap_records_disposition_source FOREIGN KEY(abnormal_disposition_id,production_batch_id,batch_step_record_id,source_report_id) REFERENCES batch_step_abnormal_dispositions(id,production_batch_id,batch_step_record_id,batch_step_report_id);
ALTER TABLE production_scrap_supplement_plan
  MODIFY COLUMN source_report_id BIGINT UNSIGNED NOT NULL,
  ADD CONSTRAINT fk_production_scrap_supplement_plan_disposition FOREIGN KEY(abnormal_disposition_id,production_batch_id,batch_step_record_id,source_report_id) REFERENCES batch_step_abnormal_dispositions(id,production_batch_id,batch_step_record_id,batch_step_report_id);
ALTER TABLE batch_step_reports DROP CHECK chk_step_report_quantity_scope, DROP COLUMN quantity_scope;
ALTER TABLE quality_process_inspection DROP FOREIGN KEY fk_process_inspection_current;
DROP TABLE quality_process_inspection_record;
DROP TABLE quality_process_inspection;
DELETE rp FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE p.code IN('quality:process-inspections:view','quality:process-inspections:record');
DELETE FROM permissions WHERE code='quality:process-inspections:record';
DELETE FROM permissions WHERE code='quality:process-inspections:view';
