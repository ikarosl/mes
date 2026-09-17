-- Development schema transition: reset old closeout data before applying.
-- No legacy approvals, duplicated output drafts, or shadow inventory facts are migrated.
CREATE TEMPORARY TABLE guard_output_revision_reset (ok TINYINT NOT NULL CHECK (ok=1));
INSERT INTO guard_output_revision_reset SELECT IF(
  EXISTS (SELECT 1 FROM production_batch_closeout)
  OR EXISTS (SELECT 1 FROM production_batch_termination)
  OR EXISTS (SELECT 1 FROM production_batches WHERE status IN ('completed','terminated','closing'))
  OR EXISTS (SELECT 1 FROM approval_instances WHERE subject_type='production_batch_closeout'),0,1);
DROP TEMPORARY TABLE guard_output_revision_reset;

ALTER TABLE production_batch_closeout
  DROP CHECK chk_closeout_output,
  DROP CHECK chk_closeout_pending,
  DROP FOREIGN KEY fk_closeout_termination,
  DROP INDEX uk_closeout_termination,
  DROP COLUMN termination_id,
  ADD COLUMN closeout_mode VARCHAR(20) NOT NULL AFTER production_batch_id,
  ADD COLUMN extra_quantity BIGINT UNSIGNED NULL AFTER available_quantity,
  ADD COLUMN output_reason TEXT NULL AFTER additional_scrap_quantity,
  ADD COLUMN inspection_record_id BIGINT UNSIGNED NULL AFTER material_review_note,
  ADD COLUMN current_revision_id BIGINT UNSIGNED NULL AFTER review_snapshot,
  ADD COLUMN correction_reason TEXT NULL AFTER current_revision_id,
  ADD CONSTRAINT chk_closeout_mode CHECK (closeout_mode IN ('normal','early')),
  ADD CONSTRAINT chk_closeout_output CHECK (
    (available_quantity IS NULL AND extra_quantity IS NULL AND additional_scrap_quantity IS NULL
      AND material_review_note IS NULL AND output_reason IS NULL AND inspection_record_id IS NULL)
    OR (available_quantity IS NOT NULL AND extra_quantity IS NOT NULL AND additional_scrap_quantity IS NOT NULL
      AND available_quantity<=99999999 AND extra_quantity<=99999999 AND additional_scrap_quantity<=99999999
      AND material_review_note IS NOT NULL AND CHAR_LENGTH(TRIM(material_review_note))>0
      AND output_reason IS NOT NULL AND CHAR_LENGTH(TRIM(output_reason))>0)
  ),
  ADD CONSTRAINT chk_closeout_correction CHECK (correction_reason IS NULL OR
    (current_revision_id IS NOT NULL AND CHAR_LENGTH(TRIM(correction_reason))>0)),
  ADD CONSTRAINT chk_closeout_pending CHECK (pending_approval_id IS NULL OR
    (approval_instance_id IS NOT NULL AND pending_approval_id=approval_instance_id
      AND review_snapshot IS NOT NULL AND available_quantity IS NOT NULL AND inspection_record_id IS NOT NULL
      AND (current_revision_id IS NULL OR correction_reason IS NOT NULL)));

DROP TABLE production_batch_termination;

ALTER TABLE production_batches
  ADD COLUMN execution_completed_at DATETIME NULL AFTER completed_at,
  ADD COLUMN execution_completed_by BIGINT UNSIGNED NULL AFTER completed_by,
  ADD CONSTRAINT fk_production_batch_execution_completed_by FOREIGN KEY (execution_completed_by) REFERENCES users(id),
  ADD CONSTRAINT chk_production_batch_execution_completed CHECK (
    (execution_completed_at IS NULL AND execution_completed_by IS NULL)
    OR (execution_completed_at IS NOT NULL AND execution_completed_by IS NOT NULL)
  );

CREATE TABLE production_output_inspection (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  closeout_id BIGINT UNSIGNED NOT NULL,
  production_batch_id BIGINT UNSIGNED NOT NULL,
  declared_version INT NOT NULL,
  declared_available_quantity BIGINT UNSIGNED NOT NULL,
  declared_extra_quantity BIGINT UNSIGNED NOT NULL,
  declared_scrap_quantity BIGINT UNSIGNED NOT NULL,
  available_quantity BIGINT UNSIGNED NOT NULL,
  extra_quantity BIGINT UNSIGNED NOT NULL,
  additional_scrap_quantity BIGINT UNSIGNED NOT NULL,
  inspected_at DATETIME NOT NULL,
  result_note TEXT NOT NULL,
  evidence_reference TEXT NOT NULL,
  previous_inspection_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_output_inspection_reference (id,closeout_id),
  KEY idx_output_inspection_root (closeout_id,id),
  CONSTRAINT fk_output_inspection_source FOREIGN KEY (closeout_id,production_batch_id) REFERENCES production_batch_closeout(id,production_batch_id),
  CONSTRAINT fk_output_inspection_previous FOREIGN KEY (previous_inspection_id,closeout_id) REFERENCES production_output_inspection(id,closeout_id),
  CONSTRAINT fk_output_inspection_actor FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT chk_output_inspection_version CHECK (declared_version>=0),
  CONSTRAINT chk_output_inspection_quantities CHECK (
    declared_available_quantity<=99999999 AND declared_extra_quantity<=99999999 AND declared_scrap_quantity<=99999999
    AND available_quantity<=99999999 AND extra_quantity<=99999999 AND additional_scrap_quantity<=99999999
  ),
  CONSTRAINT chk_output_inspection_note CHECK (CHAR_LENGTH(TRIM(result_note))>0 AND CHAR_LENGTH(TRIM(evidence_reference))>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE production_output_revision (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  closeout_id BIGINT UNSIGNED NOT NULL,
  production_batch_id BIGINT UNSIGNED NOT NULL,
  work_order_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  revision_no INT NOT NULL,
  previous_revision_id BIGINT UNSIGNED NULL,
  approval_instance_id BIGINT UNSIGNED NOT NULL,
  inspection_record_id BIGINT UNSIGNED NOT NULL,
  planned_quantity BIGINT UNSIGNED NOT NULL,
  available_quantity BIGINT UNSIGNED NOT NULL,
  extra_quantity BIGINT UNSIGNED NOT NULL,
  additional_scrap_quantity BIGINT UNSIGNED NOT NULL,
  existing_scrap_quantity BIGINT UNSIGNED NOT NULL,
  correction_reason TEXT NULL,
  review_snapshot JSON NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_output_revision_no (closeout_id,revision_no),
  UNIQUE KEY uk_output_revision_approval (approval_instance_id),
  UNIQUE KEY uk_output_revision_reference (id,closeout_id),
  UNIQUE KEY uk_output_revision_batch (id,production_batch_id),
  KEY idx_output_revision_order (work_order_id,created_at,id),
  CONSTRAINT fk_output_revision_source FOREIGN KEY (closeout_id,production_batch_id) REFERENCES production_batch_closeout(id,production_batch_id),
  CONSTRAINT fk_output_revision_order FOREIGN KEY (production_batch_id,work_order_id) REFERENCES production_batches(id,work_order_id),
  CONSTRAINT fk_output_revision_product FOREIGN KEY (production_batch_id,product_id) REFERENCES production_batches(id,product_id),
  CONSTRAINT fk_output_revision_previous FOREIGN KEY (previous_revision_id,closeout_id) REFERENCES production_output_revision(id,closeout_id),
  CONSTRAINT fk_output_revision_inspection FOREIGN KEY (inspection_record_id,closeout_id) REFERENCES production_output_inspection(id,closeout_id),
  CONSTRAINT fk_output_revision_approval FOREIGN KEY (approval_instance_id) REFERENCES approval_instances(id),
  CONSTRAINT fk_output_revision_actor FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT chk_output_revision_no CHECK (revision_no>0),
  CONSTRAINT chk_output_revision_quantities CHECK (
    planned_quantity>0 AND planned_quantity<=99999999 AND available_quantity<=planned_quantity
    AND extra_quantity<=99999999 AND additional_scrap_quantity<=99999999
  ),
  CONSTRAINT chk_output_revision_correction CHECK (
    (previous_revision_id IS NULL AND revision_no=1 AND correction_reason IS NULL)
    OR (previous_revision_id IS NOT NULL AND revision_no>1 AND correction_reason IS NOT NULL AND CHAR_LENGTH(TRIM(correction_reason))>0)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE production_batch_closeout
  ADD CONSTRAINT fk_closeout_inspection FOREIGN KEY (inspection_record_id,id) REFERENCES production_output_inspection(id,closeout_id),
  ADD CONSTRAINT fk_closeout_current_revision FOREIGN KEY (current_revision_id,id) REFERENCES production_output_revision(id,closeout_id);

CREATE TRIGGER trg_output_inspection_no_update BEFORE UPDATE ON production_output_inspection
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Output inspection records are immutable';
CREATE TRIGGER trg_output_inspection_no_delete BEFORE DELETE ON production_output_inspection
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Output inspection records are immutable';
CREATE TRIGGER trg_output_revision_no_update BEFORE UPDATE ON production_output_revision
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Approved output revisions are immutable';
CREATE TRIGGER trg_output_revision_no_delete BEFORE DELETE ON production_output_revision
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Approved output revisions are immutable';

INSERT INTO permissions (parent_id,name,code,type,api_method,api_path,sort_order,status)
SELECT id,'维护产出清单与结案审批','production:tasks:manage-output','api','POST','/api/production/batches/:batchId/output/draft',91,1
FROM (SELECT id FROM permissions WHERE code='production:tasks:view') parent;
INSERT INTO permissions (parent_id,name,code,type,api_method,api_path,sort_order,status)
SELECT id,'留存成品质检记录','production:tasks:record-inspection','api','POST','/api/production/batches/:batchId/output/inspections',92,1
FROM (SELECT id FROM permissions WHERE code='production:tasks:view') parent;
