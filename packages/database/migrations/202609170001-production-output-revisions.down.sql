-- Reset newly recorded output/inspection facts before reverting this development schema.
CREATE TEMPORARY TABLE guard_output_revision_rollback (ok TINYINT NOT NULL CHECK (ok=1));
INSERT INTO guard_output_revision_rollback SELECT IF(
  EXISTS (SELECT 1 FROM production_output_revision)
  OR EXISTS (SELECT 1 FROM production_output_inspection)
  OR EXISTS (SELECT 1 FROM production_batch_closeout)
  OR EXISTS (SELECT 1 FROM production_batches WHERE execution_completed_at IS NOT NULL),0,1);
DROP TEMPORARY TABLE guard_output_revision_rollback;

DELETE rp FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id
WHERE p.code IN ('production:tasks:manage-output','production:tasks:record-inspection');
DELETE FROM permissions WHERE code IN ('production:tasks:manage-output','production:tasks:record-inspection');

ALTER TABLE production_batch_closeout
  DROP FOREIGN KEY fk_closeout_inspection,
  DROP FOREIGN KEY fk_closeout_current_revision;
DROP TABLE production_output_revision;
DROP TABLE production_output_inspection;
ALTER TABLE production_batches
  DROP CHECK chk_production_batch_execution_completed,
  DROP FOREIGN KEY fk_production_batch_execution_completed_by,
  DROP INDEX fk_production_batch_execution_completed_by,
  DROP COLUMN execution_completed_at,
  DROP COLUMN execution_completed_by;

CREATE TABLE production_batch_termination (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  production_batch_id BIGINT UNSIGNED NOT NULL,
  work_order_id BIGINT UNSIGNED NOT NULL,
  planned_quantity DECIMAL(12,4) NOT NULL,
  available_quantity DECIMAL(12,4) NOT NULL,
  additional_scrap_quantity DECIMAL(12,4) NOT NULL,
  existing_scrap_quantity DECIMAL(12,4) NOT NULL,
  reason TEXT NOT NULL,
  material_review_note TEXT NOT NULL,
  review_snapshot JSON NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_production_batch_termination_batch (production_batch_id),
  KEY idx_production_batch_termination_order (work_order_id,created_at,id),
  CONSTRAINT fk_production_batch_termination_source FOREIGN KEY (production_batch_id,work_order_id) REFERENCES production_batches(id,work_order_id),
  CONSTRAINT fk_production_batch_termination_actor FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT chk_production_batch_termination_quantities CHECK (
    planned_quantity > 0 AND planned_quantity = TRUNCATE(planned_quantity,0)
    AND available_quantity >= 0 AND available_quantity = TRUNCATE(available_quantity,0)
    AND additional_scrap_quantity >= 0 AND additional_scrap_quantity = TRUNCATE(additional_scrap_quantity,0)
    AND existing_scrap_quantity >= 0 AND existing_scrap_quantity = TRUNCATE(existing_scrap_quantity,0)
    AND available_quantity + additional_scrap_quantity + existing_scrap_quantity <= 99999999
  ),
  CONSTRAINT chk_production_batch_termination_reason CHECK (CHAR_LENGTH(TRIM(reason)) > 0 AND CHAR_LENGTH(TRIM(material_review_note)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TRIGGER trg_production_batch_termination_no_update BEFORE UPDATE ON production_batch_termination
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Production termination facts are immutable';
CREATE TRIGGER trg_production_batch_termination_no_delete BEFORE DELETE ON production_batch_termination
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Production termination facts are immutable';


ALTER TABLE production_batch_closeout
  DROP CHECK chk_closeout_output,
  DROP CHECK chk_closeout_pending,
  DROP CHECK chk_closeout_correction,
  DROP CHECK chk_closeout_mode,
  DROP INDEX fk_closeout_inspection,
  DROP INDEX fk_closeout_current_revision,
  DROP COLUMN closeout_mode,
  DROP COLUMN extra_quantity,
  DROP COLUMN output_reason,
  DROP COLUMN inspection_record_id,
  DROP COLUMN current_revision_id,
  DROP COLUMN correction_reason,
  ADD COLUMN termination_id BIGINT UNSIGNED NULL AFTER review_snapshot,
  ADD UNIQUE KEY uk_closeout_termination (termination_id),
  ADD CONSTRAINT fk_closeout_termination FOREIGN KEY (termination_id) REFERENCES production_batch_termination(id),
  ADD CONSTRAINT chk_closeout_output CHECK (
    (available_quantity IS NULL AND additional_scrap_quantity IS NULL AND material_review_note IS NULL)
    OR (available_quantity IS NOT NULL AND additional_scrap_quantity IS NOT NULL
      AND available_quantity+additional_scrap_quantity<=99999999
      AND material_review_note IS NOT NULL AND CHAR_LENGTH(TRIM(material_review_note))>0)
  ),
  ADD CONSTRAINT chk_closeout_pending CHECK (pending_approval_id IS NULL OR
    (approval_instance_id IS NOT NULL AND pending_approval_id=approval_instance_id
     AND termination_id IS NULL AND review_snapshot IS NOT NULL AND available_quantity IS NOT NULL));
