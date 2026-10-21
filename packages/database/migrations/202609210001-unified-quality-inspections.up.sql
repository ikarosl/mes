-- Unified Quality facts; pause Quality, Procurement, Production and related approval writes.
CREATE TEMPORARY TABLE guard_unified_quality (ok TINYINT NOT NULL CHECK(ok=1));
INSERT INTO guard_unified_quality SELECT IF(EXISTS(SELECT 1 FROM procurement_receipt) OR EXISTS(SELECT 1 FROM quality_inbound_case) OR EXISTS(SELECT 1 FROM quality_finished_inspection) OR EXISTS(SELECT 1 FROM production_output_revision) OR EXISTS(SELECT 1 FROM approval_instances WHERE subject_type='production_batch_closeout') OR EXISTS(SELECT 1 FROM production_batch_closeout WHERE review_snapshot IS NOT NULL),0,1);
DROP TEMPORARY TABLE guard_unified_quality;
ALTER TABLE procurement_receipt_scope DROP FOREIGN KEY fk_procurement_scope_inspection, DROP FOREIGN KEY fk_procurement_scope_case;
ALTER TABLE procurement_supplier_return DROP FOREIGN KEY fk_procurement_return_inspection;
ALTER TABLE inbound_detail DROP FOREIGN KEY fk_inbound_detail_procurement_inspection;
ALTER TABLE production_output_revision DROP FOREIGN KEY fk_output_revision_inspection;
ALTER TABLE production_batch_closeout DROP FOREIGN KEY fk_closeout_inspection;
DROP TABLE quality_inbound_inspection;
DROP TABLE quality_inbound_case;
DROP TABLE quality_finished_inspection;
CREATE TABLE quality_inspection_case (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  receipt_line_id BIGINT UNSIGNED NULL,
  receipt_revision_id BIGINT UNSIGNED NULL,
  source_scope_id BIGINT UNSIGNED NULL,
  target_scope_id BIGINT UNSIGNED NULL,
  source_kind VARCHAR(30) NOT NULL,
  closeout_id BIGINT UNSIGNED NULL,
  production_batch_id BIGINT UNSIGNED NULL,
  declared_version INT NULL,
  declared_available_quantity INT NULL,
  declared_extra_quantity INT NULL,
  declared_scrap_quantity INT NULL,
  case_type VARCHAR(30) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'reviewing',
  declared_quantity INT NOT NULL,
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
  UNIQUE KEY uk_quality_inspection_case_line(id,receipt_line_id),
  UNIQUE KEY uk_quality_inspection_case_target(target_scope_id),
  UNIQUE KEY uk_quality_case_receipt(id,receipt_line_id,receipt_revision_id),
  UNIQUE KEY uk_quality_case_finished(id,closeout_id,production_batch_id),
  KEY idx_quality_case_finished(closeout_id,id),
  CONSTRAINT fk_quality_case_finished FOREIGN KEY(closeout_id,production_batch_id) REFERENCES production_batch_closeout(id,production_batch_id),
  CONSTRAINT chk_quality_case_source CHECK(
    (source_kind='incoming' AND receipt_line_id IS NOT NULL AND receipt_revision_id IS NOT NULL
      AND closeout_id IS NULL AND production_batch_id IS NULL AND declared_version IS NULL
      AND declared_available_quantity IS NULL AND declared_extra_quantity IS NULL AND declared_scrap_quantity IS NULL)
    OR (source_kind='finished' AND closeout_id IS NOT NULL AND production_batch_id IS NOT NULL
      AND receipt_line_id IS NULL AND receipt_revision_id IS NULL AND source_scope_id IS NULL AND target_scope_id IS NULL
      AND declared_version IS NOT NULL AND declared_version>=0
      AND declared_available_quantity IS NOT NULL AND declared_available_quantity BETWEEN 0 AND 99999999
      AND declared_extra_quantity IS NOT NULL AND declared_extra_quantity BETWEEN 0 AND 99999999
      AND declared_scrap_quantity IS NOT NULL AND declared_scrap_quantity BETWEEN 0 AND 99999999
      AND declared_quantity=declared_available_quantity+declared_extra_quantity)
  ),
  KEY idx_quality_inspection_case_status(status,created_at,id),
  KEY idx_quality_inspection_case_line(receipt_line_id,id),
  CONSTRAINT fk_quality_inspection_case_line FOREIGN KEY(receipt_line_id) REFERENCES procurement_receipt_line(id),
  CONSTRAINT fk_quality_inspection_case_revision FOREIGN KEY(receipt_revision_id,receipt_line_id) REFERENCES procurement_receipt_revision(id,receipt_line_id),
  CONSTRAINT fk_quality_inspection_case_source FOREIGN KEY(source_scope_id,receipt_line_id) REFERENCES procurement_receipt_scope(id,receipt_line_id),
  CONSTRAINT fk_quality_inspection_case_target FOREIGN KEY(target_scope_id,receipt_line_id) REFERENCES procurement_receipt_scope(id,receipt_line_id),
  CONSTRAINT fk_quality_inspection_case_superseded FOREIGN KEY(superseded_by_receipt_revision_id,receipt_line_id) REFERENCES procurement_receipt_revision(id,receipt_line_id),
  CONSTRAINT fk_quality_inspection_case_creator FOREIGN KEY(created_by) REFERENCES users(id),
  CONSTRAINT fk_quality_inspection_case_updater FOREIGN KEY(updated_by) REFERENCES users(id),
  CONSTRAINT fk_quality_inspection_case_completer FOREIGN KEY(completed_by) REFERENCES users(id),
  CONSTRAINT chk_quality_inspection_case_type CHECK(case_type IN ('initial','reinspection','inspection_correction','receipt_correction')),
  CONSTRAINT chk_quality_inspection_case_status CHECK(status IN ('reviewing','completed','superseded')),
  CONSTRAINT chk_quality_inspection_case_version CHECK(version>=0),
  CONSTRAINT chk_quality_inspection_case_reason CHECK(CHAR_LENGTH(TRIM(reason))>0),
  CONSTRAINT chk_quality_inspection_case_quantity CHECK(declared_quantity BETWEEN 0 AND 99999999),
  CONSTRAINT chk_quality_inspection_case_scope CHECK(
    source_kind='finished' OR (((declared_quantity=0 AND case_type='receipt_correction' AND target_scope_id IS NULL)
      OR (declared_quantity>0 AND target_scope_id IS NOT NULL))
    AND (source_scope_id IS NOT NULL OR case_type='receipt_correction'))
  ),
  CONSTRAINT chk_quality_inspection_case_metadata CHECK(
    (status='reviewing' AND completed_by IS NULL AND completed_at IS NULL AND superseded_by_receipt_revision_id IS NULL)
    OR (status='completed' AND completed_by IS NOT NULL AND completed_at IS NOT NULL AND superseded_by_receipt_revision_id IS NULL)
    OR (status='superseded' AND completed_by IS NULL AND completed_at IS NULL AND superseded_by_receipt_revision_id IS NOT NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE quality_inspection_record (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  case_id BIGINT UNSIGNED NOT NULL,
  receipt_line_id BIGINT UNSIGNED NULL,
  receipt_revision_id BIGINT UNSIGNED NULL,
  closeout_id BIGINT UNSIGNED NULL,
  production_batch_id BIGINT UNSIGNED NULL,
  inspection_method VARCHAR(30) NOT NULL,
  covered_quantity INT NOT NULL,
  qualified_quantity INT NOT NULL,
  unqualified_quantity INT NOT NULL,
  release_decision VARCHAR(30) NOT NULL,
  previous_record_id BIGINT UNSIGNED NULL,
  inspected_at DATETIME NOT NULL,
  result_note TEXT NOT NULL,
  evidence_reference TEXT NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_quality_record_case(case_id),
  UNIQUE KEY uk_quality_record_receipt(id,receipt_line_id),
  UNIQUE KEY uk_quality_record_finished(id,closeout_id),
  KEY idx_quality_record_receipt(receipt_line_id,id),
  KEY idx_quality_record_batch(production_batch_id,id),
  CONSTRAINT fk_quality_record_case FOREIGN KEY(case_id) REFERENCES quality_inspection_case(id),
  CONSTRAINT fk_quality_record_receipt FOREIGN KEY(case_id,receipt_line_id,receipt_revision_id) REFERENCES quality_inspection_case(id,receipt_line_id,receipt_revision_id),
  CONSTRAINT fk_quality_record_finished FOREIGN KEY(case_id,closeout_id,production_batch_id) REFERENCES quality_inspection_case(id,closeout_id,production_batch_id),
  CONSTRAINT fk_quality_record_previous_receipt FOREIGN KEY(previous_record_id,receipt_line_id) REFERENCES quality_inspection_record(id,receipt_line_id),
  CONSTRAINT fk_quality_record_previous_finished FOREIGN KEY(previous_record_id,closeout_id) REFERENCES quality_inspection_record(id,closeout_id),
  CONSTRAINT fk_quality_record_actor FOREIGN KEY(created_by) REFERENCES users(id),
  CONSTRAINT chk_quality_record_source CHECK(
    (receipt_line_id IS NOT NULL AND receipt_revision_id IS NOT NULL AND closeout_id IS NULL AND production_batch_id IS NULL)
    OR (receipt_line_id IS NULL AND receipt_revision_id IS NULL AND closeout_id IS NOT NULL AND production_batch_id IS NOT NULL)
  ),
  CONSTRAINT chk_quality_record_quantity CHECK(covered_quantity BETWEEN 0 AND 99999999
    AND qualified_quantity BETWEEN 0 AND 99999999 AND unqualified_quantity BETWEEN 0 AND 99999999
    AND qualified_quantity+unqualified_quantity<=covered_quantity),
  CONSTRAINT chk_quality_record_release CHECK(release_decision IN('released','pending_reinspection','not_released')),
  CONSTRAINT chk_quality_record_measurements CHECK(
    (inspection_method='full' AND covered_quantity>0 AND covered_quantity=qualified_quantity+unqualified_quantity)
    OR (inspection_method='sampling' AND covered_quantity>0 AND qualified_quantity+unqualified_quantity>0)
    OR (inspection_method='zero_confirmation' AND covered_quantity=0 AND qualified_quantity=0 AND unqualified_quantity=0 AND release_decision='released')
  ),
  CONSTRAINT chk_quality_record_evidence CHECK(CHAR_LENGTH(TRIM(result_note))>0 AND CHAR_LENGTH(TRIM(evidence_reference))>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TRIGGER trg_quality_record_no_update BEFORE UPDATE ON quality_inspection_record
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Inspection records are immutable';
CREATE TRIGGER trg_quality_record_no_delete BEFORE DELETE ON quality_inspection_record
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Inspection records are immutable';
ALTER TABLE procurement_receipt_scope
  ADD CONSTRAINT fk_procurement_scope_inspection FOREIGN KEY(inspection_id,receipt_line_id) REFERENCES quality_inspection_record(id,receipt_line_id),
  ADD CONSTRAINT fk_procurement_scope_case FOREIGN KEY(review_case_id,receipt_line_id) REFERENCES quality_inspection_case(id,receipt_line_id);
ALTER TABLE procurement_supplier_return ADD CONSTRAINT fk_procurement_return_inspection FOREIGN KEY(inspection_id,receipt_line_id) REFERENCES quality_inspection_record(id,receipt_line_id);
ALTER TABLE inbound_detail ADD CONSTRAINT fk_inbound_detail_procurement_inspection FOREIGN KEY(procurement_inspection_id,procurement_receipt_line_id) REFERENCES quality_inspection_record(id,receipt_line_id);
ALTER TABLE production_output_revision ADD CONSTRAINT fk_output_revision_inspection FOREIGN KEY(inspection_record_id,closeout_id) REFERENCES quality_inspection_record(id,closeout_id);
ALTER TABLE production_batch_closeout ADD CONSTRAINT fk_closeout_inspection FOREIGN KEY(inspection_record_id,id) REFERENCES quality_inspection_record(id,closeout_id);
