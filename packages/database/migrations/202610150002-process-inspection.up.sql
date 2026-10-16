-- Pause Quality and Production writes while switching the process inspection contract.
CREATE TABLE quality_process_inspection (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  production_batch_id BIGINT UNSIGNED NOT NULL,
  batch_step_record_id BIGINT UNSIGNED NOT NULL,
  current_record_id BIGINT UNSIGNED NULL,
  accepted_quantity INT NOT NULL DEFAULT 0,
  version INT NOT NULL DEFAULT 0,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(id),
  UNIQUE KEY uk_process_inspection_source(id,production_batch_id,batch_step_record_id),
  KEY idx_process_inspection_step(batch_step_record_id,created_at,id),
  KEY idx_process_inspection_batch(production_batch_id,created_at,id),
  CONSTRAINT fk_process_inspection_step FOREIGN KEY(batch_step_record_id,production_batch_id) REFERENCES batch_step_records(id,production_batch_id),
  CONSTRAINT fk_process_inspection_creator FOREIGN KEY(created_by) REFERENCES users(id),
  CONSTRAINT fk_process_inspection_updater FOREIGN KEY(updated_by) REFERENCES users(id),
  CONSTRAINT chk_process_inspection_accepted CHECK(accepted_quantity BETWEEN 0 AND 99999999),
  CONSTRAINT chk_process_inspection_version CHECK(version>=0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE quality_process_inspection_record (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  inspection_id BIGINT UNSIGNED NOT NULL,
  record_type VARCHAR(20) NOT NULL,
  inspection_method VARCHAR(20) NOT NULL,
  qualified_quantity INT NOT NULL,
  unqualified_quantity INT NOT NULL,
  scope_note TEXT NOT NULL,
  inspected_at DATETIME NOT NULL,
  result_note TEXT NOT NULL,
  evidence_reference TEXT NOT NULL,
  reversal_of_record_id BIGINT UNSIGNED NULL,
  replaces_record_id BIGINT UNSIGNED NULL,
  reason TEXT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id),
  UNIQUE KEY uk_process_inspection_record_source(id,inspection_id),
  UNIQUE KEY uk_process_inspection_record_reversal(reversal_of_record_id),
  UNIQUE KEY uk_process_inspection_record_replacement(replaces_record_id),
  KEY idx_process_inspection_record_history(inspection_id,created_at,id),
  CONSTRAINT fk_process_inspection_record_header FOREIGN KEY(inspection_id) REFERENCES quality_process_inspection(id),
  CONSTRAINT fk_process_inspection_record_reversal FOREIGN KEY(reversal_of_record_id,inspection_id) REFERENCES quality_process_inspection_record(id,inspection_id),
  CONSTRAINT fk_process_inspection_record_replacement FOREIGN KEY(replaces_record_id,inspection_id) REFERENCES quality_process_inspection_record(id,inspection_id),
  CONSTRAINT fk_process_inspection_record_creator FOREIGN KEY(created_by) REFERENCES users(id),
  CONSTRAINT chk_process_inspection_record_type CHECK(record_type IN('normal','reversal')),
  CONSTRAINT chk_process_inspection_record_method CHECK(inspection_method IN('full','sampling')),
  CONSTRAINT chk_process_inspection_record_quantity CHECK(qualified_quantity BETWEEN 0 AND 99999999 AND unqualified_quantity BETWEEN 0 AND 99999999 AND qualified_quantity+unqualified_quantity BETWEEN 1 AND 99999999),
  CONSTRAINT chk_process_inspection_record_links CHECK(
    (record_type='normal' AND reversal_of_record_id IS NULL)
    OR (record_type='reversal' AND reversal_of_record_id IS NOT NULL AND replaces_record_id IS NULL)
  ),
  CONSTRAINT chk_process_inspection_record_reason CHECK(
    (record_type='normal' AND replaces_record_id IS NULL AND reason IS NULL)
    OR (reason IS NOT NULL AND CHAR_LENGTH(TRIM(reason)) BETWEEN 1 AND 5000)
  ),
  CONSTRAINT chk_process_inspection_record_evidence CHECK(CHAR_LENGTH(TRIM(scope_note)) BETWEEN 1 AND 5000 AND CHAR_LENGTH(TRIM(result_note)) BETWEEN 1 AND 5000 AND CHAR_LENGTH(TRIM(evidence_reference)) BETWEEN 1 AND 5000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
ALTER TABLE quality_process_inspection ADD CONSTRAINT fk_process_inspection_current FOREIGN KEY(current_record_id,id) REFERENCES quality_process_inspection_record(id,inspection_id);
CREATE TRIGGER trg_process_inspection_record_no_update BEFORE UPDATE ON quality_process_inspection_record
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Process inspection records are immutable';
CREATE TRIGGER trg_process_inspection_record_no_delete BEFORE DELETE ON quality_process_inspection_record
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Process inspection records are immutable';

ALTER TABLE rework_records DROP FOREIGN KEY fk_rework_records_disposition_source, DROP FOREIGN KEY fk_rework_records_source_report;
ALTER TABLE batch_step_scrap_records DROP FOREIGN KEY fk_batch_step_scrap_records_disposition_source;
ALTER TABLE production_scrap_supplement_plan DROP FOREIGN KEY fk_production_scrap_supplement_plan_disposition;
ALTER TABLE batch_step_abnormal_dispositions DROP FOREIGN KEY fk_batch_step_abnormal_dispositions_report;
ALTER TABLE batch_step_abnormal_dispositions
  MODIFY COLUMN batch_step_report_id BIGINT UNSIGNED NULL,
  ADD COLUMN source_type VARCHAR(30) NOT NULL DEFAULT 'report',
  ADD COLUMN process_inspection_id BIGINT UNSIGNED NULL,
  ADD COLUMN process_inspection_record_id BIGINT UNSIGNED NULL,
  ADD COLUMN inspection_quantity INT NULL,
  ADD COLUMN unit_snapshot VARCHAR(20) NULL,
  ADD UNIQUE KEY uk_abnormal_disposition_step(id,production_batch_id,batch_step_record_id),
  ADD KEY idx_abnormal_disposition_step_source(batch_step_record_id,production_batch_id),
  ADD KEY idx_abnormal_disposition_inspection(process_inspection_id,production_batch_id,batch_step_record_id),
  ADD KEY idx_abnormal_disposition_inspection_record(process_inspection_record_id,process_inspection_id),
  ADD CONSTRAINT fk_abnormal_disposition_step FOREIGN KEY(batch_step_record_id,production_batch_id) REFERENCES batch_step_records(id,production_batch_id),
  ADD CONSTRAINT fk_batch_step_abnormal_dispositions_report FOREIGN KEY(batch_step_report_id,batch_step_record_id,production_batch_id) REFERENCES batch_step_reports(id,batch_step_record_id,production_batch_id),
  ADD CONSTRAINT fk_abnormal_disposition_inspection FOREIGN KEY(process_inspection_id,production_batch_id,batch_step_record_id) REFERENCES quality_process_inspection(id,production_batch_id,batch_step_record_id),
  ADD CONSTRAINT fk_abnormal_disposition_inspection_record FOREIGN KEY(process_inspection_record_id,process_inspection_id) REFERENCES quality_process_inspection_record(id,inspection_id),
  ADD CONSTRAINT chk_abnormal_disposition_source CHECK(
    (source_type='report' AND batch_step_report_id IS NOT NULL AND process_inspection_id IS NULL AND process_inspection_record_id IS NULL AND inspection_quantity IS NULL AND unit_snapshot IS NULL)
    OR (source_type='process_inspection' AND batch_step_report_id IS NULL AND process_inspection_id IS NOT NULL AND process_inspection_record_id IS NOT NULL AND inspection_quantity BETWEEN 1 AND 99999999 AND inspection_quantity IS NOT NULL AND unit_snapshot IS NOT NULL AND CHAR_LENGTH(TRIM(unit_snapshot))>0)
  );
ALTER TABLE rework_records
  MODIFY COLUMN source_report_id BIGINT UNSIGNED NULL,
  ADD CONSTRAINT fk_rework_records_disposition_source FOREIGN KEY(abnormal_disposition_id,production_batch_id,batch_step_record_id,source_report_id) REFERENCES batch_step_abnormal_dispositions(id,production_batch_id,batch_step_record_id,batch_step_report_id),
  ADD CONSTRAINT fk_rework_records_source_report FOREIGN KEY(source_report_id,batch_step_record_id,production_batch_id) REFERENCES batch_step_reports(id,batch_step_record_id,production_batch_id),
  ADD CONSTRAINT fk_rework_disposition_step FOREIGN KEY(abnormal_disposition_id,production_batch_id,batch_step_record_id) REFERENCES batch_step_abnormal_dispositions(id,production_batch_id,batch_step_record_id);
ALTER TABLE batch_step_scrap_records
  MODIFY COLUMN source_report_id BIGINT UNSIGNED NULL,
  ADD CONSTRAINT fk_batch_step_scrap_records_disposition_source FOREIGN KEY(abnormal_disposition_id,production_batch_id,batch_step_record_id,source_report_id) REFERENCES batch_step_abnormal_dispositions(id,production_batch_id,batch_step_record_id,batch_step_report_id),
  ADD CONSTRAINT fk_step_scrap_disposition_step FOREIGN KEY(abnormal_disposition_id,production_batch_id,batch_step_record_id) REFERENCES batch_step_abnormal_dispositions(id,production_batch_id,batch_step_record_id);
ALTER TABLE production_scrap_supplement_plan
  MODIFY COLUMN source_report_id BIGINT UNSIGNED NULL,
  ADD CONSTRAINT fk_production_scrap_supplement_plan_disposition FOREIGN KEY(abnormal_disposition_id,production_batch_id,batch_step_record_id,source_report_id) REFERENCES batch_step_abnormal_dispositions(id,production_batch_id,batch_step_record_id,batch_step_report_id),
  ADD CONSTRAINT fk_scrap_plan_disposition_step FOREIGN KEY(abnormal_disposition_id,production_batch_id,batch_step_record_id) REFERENCES batch_step_abnormal_dispositions(id,production_batch_id,batch_step_record_id);
ALTER TABLE batch_step_reports
  ADD COLUMN quantity_scope VARCHAR(20) NOT NULL DEFAULT 'production',
  ADD CONSTRAINT chk_step_report_quantity_scope CHECK(quantity_scope IN('production','inspection'));

INSERT INTO permissions(parent_id,name,code,type,route_path,api_method,api_path,sort_order,status)
SELECT id,'工序专检','quality:process-inspections:view','page','/quality/process-inspections',NULL,NULL,30,1
FROM permissions WHERE code='quality:view';
INSERT INTO permissions(parent_id,name,code,type,route_path,api_method,api_path,sort_order,status)
SELECT id,'登记与更正工序专检','quality:process-inspections:record','button',NULL,NULL,NULL,10,1
FROM permissions WHERE code='quality:process-inspections:view';
