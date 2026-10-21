-- Refuse to discard inspection, receipt or approved output facts.
CREATE TEMPORARY TABLE guard_unified_quality_down (ok TINYINT NOT NULL CHECK(ok=1));
INSERT INTO guard_unified_quality_down SELECT IF(EXISTS(SELECT 1 FROM procurement_receipt) OR EXISTS(SELECT 1 FROM quality_inspection_case) OR EXISTS(SELECT 1 FROM quality_inspection_record) OR EXISTS(SELECT 1 FROM production_output_revision) OR EXISTS(SELECT 1 FROM approval_instances WHERE subject_type='production_batch_closeout') OR EXISTS(SELECT 1 FROM production_batch_closeout WHERE review_snapshot IS NOT NULL),0,1);
DROP TEMPORARY TABLE guard_unified_quality_down;
ALTER TABLE procurement_receipt_scope DROP FOREIGN KEY fk_procurement_scope_inspection, DROP FOREIGN KEY fk_procurement_scope_case;
ALTER TABLE procurement_supplier_return DROP FOREIGN KEY fk_procurement_return_inspection;
ALTER TABLE inbound_detail DROP FOREIGN KEY fk_inbound_detail_procurement_inspection;
ALTER TABLE production_output_revision DROP FOREIGN KEY fk_output_revision_inspection;
ALTER TABLE production_batch_closeout DROP FOREIGN KEY fk_closeout_inspection;
DROP TABLE quality_inspection_record;
DROP TABLE quality_inspection_case;
CREATE TABLE quality_inbound_case (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  receipt_line_id BIGINT UNSIGNED NOT NULL,
  receipt_revision_id BIGINT UNSIGNED NOT NULL,
  source_scope_id BIGINT UNSIGNED NULL,
  target_scope_id BIGINT UNSIGNED NULL,
  case_type VARCHAR(30) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'reviewing',
  covered_quantity INT NOT NULL,
  reason TEXT NOT NULL,
  completed_by BIGINT UNSIGNED NULL,
  completed_at DATETIME NULL,
  superseded_by_receipt_revision_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  version INT NOT NULL DEFAULT 0,
  PRIMARY KEY(id),
  UNIQUE KEY uk_quality_inbound_case_line(id,receipt_line_id),
  UNIQUE KEY uk_quality_inbound_case_target(target_scope_id),
  KEY idx_quality_inbound_case_status(status,created_at,id),
  KEY idx_quality_inbound_case_line(receipt_line_id,id),
  CONSTRAINT fk_quality_inbound_case_line FOREIGN KEY(receipt_line_id) REFERENCES procurement_receipt_line(id),
  CONSTRAINT fk_quality_inbound_case_revision FOREIGN KEY(receipt_revision_id,receipt_line_id) REFERENCES procurement_receipt_revision(id,receipt_line_id),
  CONSTRAINT fk_quality_inbound_case_source FOREIGN KEY(source_scope_id,receipt_line_id) REFERENCES procurement_receipt_scope(id,receipt_line_id),
  CONSTRAINT fk_quality_inbound_case_target FOREIGN KEY(target_scope_id,receipt_line_id) REFERENCES procurement_receipt_scope(id,receipt_line_id),
  CONSTRAINT fk_quality_inbound_case_superseded FOREIGN KEY(superseded_by_receipt_revision_id,receipt_line_id) REFERENCES procurement_receipt_revision(id,receipt_line_id),
  CONSTRAINT fk_quality_inbound_case_creator FOREIGN KEY(created_by) REFERENCES users(id),
  CONSTRAINT fk_quality_inbound_case_updater FOREIGN KEY(updated_by) REFERENCES users(id),
  CONSTRAINT fk_quality_inbound_case_completer FOREIGN KEY(completed_by) REFERENCES users(id),
  CONSTRAINT chk_quality_inbound_case_type CHECK(case_type IN ('initial','reinspection','inspection_correction','receipt_correction')),
  CONSTRAINT chk_quality_inbound_case_status CHECK(status IN ('reviewing','completed','superseded')),
  CONSTRAINT chk_quality_inbound_case_version CHECK(version>=0),
  CONSTRAINT chk_quality_inbound_case_reason CHECK(CHAR_LENGTH(TRIM(reason))>0),
  CONSTRAINT chk_quality_inbound_case_quantity CHECK(covered_quantity BETWEEN 0 AND 99999999),
  CONSTRAINT chk_quality_inbound_case_scope CHECK(
    ((covered_quantity=0 AND case_type='receipt_correction' AND target_scope_id IS NULL)
      OR (covered_quantity>0 AND target_scope_id IS NOT NULL))
    AND (source_scope_id IS NOT NULL OR case_type='receipt_correction')
  ),
  CONSTRAINT chk_quality_inbound_case_metadata CHECK(
    (status='reviewing' AND completed_by IS NULL AND completed_at IS NULL AND superseded_by_receipt_revision_id IS NULL)
    OR (status='completed' AND completed_by IS NOT NULL AND completed_at IS NOT NULL AND superseded_by_receipt_revision_id IS NULL)
    OR (status='superseded' AND completed_by IS NULL AND completed_at IS NULL AND superseded_by_receipt_revision_id IS NOT NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE quality_inbound_inspection (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  case_id BIGINT UNSIGNED NOT NULL,
  receipt_line_id BIGINT UNSIGNED NOT NULL,
  receipt_revision_id BIGINT UNSIGNED NOT NULL,
  covered_quantity INT NOT NULL,
  inspection_method VARCHAR(30) NOT NULL,
  qualified_quantity INT NULL,
  unqualified_quantity INT NULL,
  sample_quantity INT NULL,
  sample_unqualified_quantity INT NULL,
  removed_defect_quantity INT NOT NULL,
  inbound_approved TINYINT NOT NULL,
  disposition VARCHAR(30) NOT NULL,
  approved_quantity INT NOT NULL,
  quality_return_quantity INT NOT NULL,
  undetermined_quantity INT NOT NULL,
  remark TEXT NOT NULL,
  evidence TEXT NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id),
  UNIQUE KEY uk_quality_inbound_inspection_case(case_id),
  UNIQUE KEY uk_quality_inbound_inspection_line(id,receipt_line_id),
  KEY idx_quality_inbound_inspection_line(receipt_line_id,created_at,id),
  CONSTRAINT fk_quality_inbound_inspection_case FOREIGN KEY(case_id,receipt_line_id) REFERENCES quality_inbound_case(id,receipt_line_id),
  CONSTRAINT fk_quality_inbound_inspection_revision FOREIGN KEY(receipt_revision_id,receipt_line_id) REFERENCES procurement_receipt_revision(id,receipt_line_id),
  CONSTRAINT fk_quality_inbound_inspection_creator FOREIGN KEY(created_by) REFERENCES users(id),
  CONSTRAINT chk_quality_inbound_inspection_quantities CHECK(
    covered_quantity BETWEEN 0 AND 99999999
    AND (qualified_quantity IS NULL OR qualified_quantity BETWEEN 0 AND 99999999)
    AND (unqualified_quantity IS NULL OR unqualified_quantity BETWEEN 0 AND 99999999)
    AND (sample_quantity IS NULL OR sample_quantity BETWEEN 1 AND 99999999)
    AND (sample_unqualified_quantity IS NULL OR sample_unqualified_quantity BETWEEN 0 AND 99999999)
    AND removed_defect_quantity BETWEEN 0 AND covered_quantity
    AND approved_quantity BETWEEN 0 AND covered_quantity
    AND quality_return_quantity BETWEEN 0 AND covered_quantity
    AND undetermined_quantity BETWEEN 0 AND covered_quantity
    AND approved_quantity+quality_return_quantity+undetermined_quantity=covered_quantity
  ),
  CONSTRAINT chk_quality_inbound_inspection_boolean CHECK(inbound_approved IN(0,1)),
  CONSTRAINT chk_quality_inbound_inspection_method CHECK(inspection_method IN('full','sampling','review_only')),
  CONSTRAINT chk_quality_inbound_inspection_disposition CHECK(disposition IN('release','await_full_inspection','await_decision','return_all','receipt_zero_confirmed')),
  CONSTRAINT chk_quality_inbound_inspection_evidence CHECK(CHAR_LENGTH(TRIM(remark))>0 AND CHAR_LENGTH(TRIM(evidence))>0),
  CONSTRAINT chk_quality_inbound_inspection_measurements CHECK(
    (inspection_method='full' AND covered_quantity>0 AND qualified_quantity IS NOT NULL AND unqualified_quantity IS NOT NULL
      AND qualified_quantity+unqualified_quantity=covered_quantity AND removed_defect_quantity<=unqualified_quantity
      AND sample_quantity IS NULL AND sample_unqualified_quantity IS NULL)
    OR (inspection_method='sampling' AND covered_quantity>0 AND qualified_quantity IS NULL AND unqualified_quantity IS NULL
      AND sample_quantity IS NOT NULL AND sample_unqualified_quantity IS NOT NULL
      AND sample_quantity BETWEEN 1 AND covered_quantity AND sample_unqualified_quantity BETWEEN 0 AND sample_quantity)
    OR (inspection_method='review_only' AND covered_quantity=0 AND qualified_quantity IS NULL AND unqualified_quantity IS NULL
      AND sample_quantity IS NULL AND sample_unqualified_quantity IS NULL AND disposition='receipt_zero_confirmed')
  ),
  CONSTRAINT chk_quality_inbound_inspection_result CHECK(
    (disposition='release' AND covered_quantity>0 AND inbound_approved=1
      AND approved_quantity=covered_quantity-removed_defect_quantity AND quality_return_quantity=removed_defect_quantity AND undetermined_quantity=0
      AND ((inspection_method='full' AND removed_defect_quantity=unqualified_quantity)
        OR (inspection_method='sampling' AND removed_defect_quantity>=sample_unqualified_quantity)))
    OR (disposition='return_all' AND covered_quantity>0 AND inbound_approved=0 AND approved_quantity=0 AND quality_return_quantity=covered_quantity AND undetermined_quantity=0)
    OR (disposition IN('await_full_inspection','await_decision') AND covered_quantity>0 AND inbound_approved=0 AND approved_quantity=0
      AND quality_return_quantity=removed_defect_quantity AND undetermined_quantity=covered_quantity-removed_defect_quantity)
    OR (disposition='receipt_zero_confirmed' AND covered_quantity=0 AND inspection_method='review_only' AND inbound_approved=0)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TRIGGER trg_quality_inbound_inspection_no_update BEFORE UPDATE ON quality_inbound_inspection
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Inbound inspection facts are immutable';
END;
CREATE TRIGGER trg_quality_inbound_inspection_no_delete BEFORE DELETE ON quality_inbound_inspection
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Inbound inspection facts cannot be deleted';
END;

CREATE TABLE quality_finished_inspection (
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
  CONSTRAINT fk_output_inspection_previous FOREIGN KEY (previous_inspection_id,closeout_id) REFERENCES quality_finished_inspection(id,closeout_id),
  CONSTRAINT fk_output_inspection_actor FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT chk_output_inspection_version CHECK (declared_version>=0),
  CONSTRAINT chk_output_inspection_quantities CHECK (
    declared_available_quantity<=99999999 AND declared_extra_quantity<=99999999 AND declared_scrap_quantity<=99999999
    AND available_quantity<=99999999 AND extra_quantity<=99999999 AND additional_scrap_quantity<=99999999
  ),
  CONSTRAINT chk_output_inspection_note CHECK (CHAR_LENGTH(TRIM(result_note))>0 AND CHAR_LENGTH(TRIM(evidence_reference))>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
ALTER TABLE quality_finished_inspection
  DROP CHECK chk_output_inspection_quantities;
ALTER TABLE quality_finished_inspection
  DROP COLUMN available_quantity,
  DROP COLUMN extra_quantity,
  DROP COLUMN additional_scrap_quantity,
  ADD COLUMN inspection_method VARCHAR(30) NOT NULL AFTER declared_scrap_quantity,
  ADD COLUMN scope_reference VARCHAR(1000) NOT NULL AFTER inspection_method,
  ADD COLUMN covered_quantity INT UNSIGNED NOT NULL AFTER scope_reference,
  ADD COLUMN inspected_quantity INT UNSIGNED NOT NULL AFTER covered_quantity,
  ADD COLUMN unqualified_quantity INT UNSIGNED NOT NULL AFTER inspected_quantity,
  ADD COLUMN removed_quantity INT UNSIGNED NOT NULL AFTER unqualified_quantity,
  ADD COLUMN release_decision VARCHAR(30) NOT NULL AFTER removed_quantity,
  ADD CONSTRAINT chk_output_inspection_method CHECK (inspection_method IN ('full','sampling','zero_confirmation')),
  ADD CONSTRAINT chk_output_inspection_release CHECK (release_decision IN ('released','pending_reinspection','not_released')),
  ADD CONSTRAINT chk_output_inspection_scope CHECK (CHAR_LENGTH(TRIM(scope_reference))>0),
  ADD CONSTRAINT chk_output_inspection_quantities CHECK (
    declared_available_quantity<=99999999 AND declared_extra_quantity<=99999999 AND declared_scrap_quantity<=99999999
    AND covered_quantity<=99999999 AND inspected_quantity<=covered_quantity
    AND unqualified_quantity<=inspected_quantity
    AND removed_quantity>=unqualified_quantity AND removed_quantity<=covered_quantity
  ),
  ADD CONSTRAINT chk_output_inspection_method_quantities CHECK (
    (inspection_method='full' AND covered_quantity>0 AND inspected_quantity=covered_quantity AND removed_quantity=unqualified_quantity)
    OR (inspection_method='sampling' AND covered_quantity>0 AND inspected_quantity>0)
    OR (inspection_method='zero_confirmation' AND covered_quantity=0 AND inspected_quantity=0
      AND unqualified_quantity=0 AND removed_quantity=0 AND release_decision='released')
  );

ALTER TABLE quality_finished_inspection
  DROP CHECK chk_output_inspection_scope,
  DROP CHECK chk_output_inspection_quantities,
  DROP CHECK chk_output_inspection_method_quantities;
ALTER TABLE quality_finished_inspection
  DROP COLUMN scope_reference,
  DROP COLUMN removed_quantity,
  ADD CONSTRAINT chk_output_inspection_quantities CHECK (
    declared_available_quantity<=99999999 AND declared_extra_quantity<=99999999 AND declared_scrap_quantity<=99999999
    AND covered_quantity<=99999999 AND inspected_quantity<=covered_quantity
    AND unqualified_quantity<=inspected_quantity
  ),
  ADD CONSTRAINT chk_output_inspection_method_quantities CHECK (
    (inspection_method='full' AND covered_quantity>0 AND inspected_quantity=covered_quantity)
    OR (inspection_method='sampling' AND covered_quantity>0 AND inspected_quantity>0)
    OR (inspection_method='zero_confirmation' AND covered_quantity=0 AND inspected_quantity=0
      AND unqualified_quantity=0 AND release_decision='released')
  );
CREATE TRIGGER trg_quality_finished_inspection_no_update BEFORE UPDATE ON quality_finished_inspection
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Finished inspection records are immutable';
CREATE TRIGGER trg_quality_finished_inspection_no_delete BEFORE DELETE ON quality_finished_inspection
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Finished inspection records are immutable';
CREATE INDEX idx_quality_finished_batch ON quality_finished_inspection(production_batch_id,id);
ALTER TABLE procurement_receipt_scope
  ADD CONSTRAINT fk_procurement_scope_inspection FOREIGN KEY(inspection_id,receipt_line_id) REFERENCES quality_inbound_inspection(id,receipt_line_id),
  ADD CONSTRAINT fk_procurement_scope_case FOREIGN KEY(review_case_id,receipt_line_id) REFERENCES quality_inbound_case(id,receipt_line_id);
ALTER TABLE procurement_supplier_return ADD CONSTRAINT fk_procurement_return_inspection FOREIGN KEY(inspection_id,receipt_line_id) REFERENCES quality_inbound_inspection(id,receipt_line_id);
ALTER TABLE inbound_detail ADD CONSTRAINT fk_inbound_detail_procurement_inspection FOREIGN KEY(procurement_inspection_id,procurement_receipt_line_id) REFERENCES quality_inbound_inspection(id,receipt_line_id);
ALTER TABLE production_output_revision ADD CONSTRAINT fk_output_revision_inspection FOREIGN KEY(inspection_record_id,closeout_id) REFERENCES quality_finished_inspection(id,closeout_id);
ALTER TABLE production_batch_closeout ADD CONSTRAINT fk_closeout_inspection FOREIGN KEY(inspection_record_id,id) REFERENCES quality_finished_inspection(id,closeout_id);
