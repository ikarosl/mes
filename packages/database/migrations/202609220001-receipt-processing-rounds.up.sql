-- Stop related writers. Existing incoming facts must be reset through the development initializer.
-- This migration does not guess historical rounds or overwrite immutable inspection records.
CREATE TEMPORARY TABLE guard_receipt_rounds (ok TINYINT NOT NULL CHECK(ok=1));
INSERT INTO guard_receipt_rounds SELECT IF(EXISTS(SELECT 1 FROM procurement_receipt)
  OR EXISTS(SELECT 1 FROM quality_inspection_case WHERE source_kind='incoming'),0,1);
DROP TEMPORARY TABLE guard_receipt_rounds;

CREATE TABLE procurement_receipt_round (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  receipt_line_id BIGINT UNSIGNED NOT NULL,
  round_no INT NOT NULL,
  previous_round_id BIGINT UNSIGNED NULL,
  trigger_type VARCHAR(30) NOT NULL,
  receipt_revision_id BIGINT UNSIGNED NOT NULL,
  starting_quantity INT NOT NULL,
  status VARCHAR(30) NOT NULL,
  inspection_id BIGINT UNSIGNED NULL,
  reason TEXT NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  version INT NOT NULL DEFAULT 0,
  UNIQUE KEY uk_receipt_round_line(id,receipt_line_id),
  UNIQUE KEY uk_receipt_round_number(receipt_line_id,round_no),
  KEY idx_receipt_round_status(status,created_at,id),
  CONSTRAINT fk_receipt_round_line FOREIGN KEY(receipt_line_id) REFERENCES procurement_receipt_line(id),
  CONSTRAINT fk_receipt_round_previous FOREIGN KEY(previous_round_id,receipt_line_id) REFERENCES procurement_receipt_round(id,receipt_line_id),
  CONSTRAINT fk_receipt_round_revision FOREIGN KEY(receipt_revision_id,receipt_line_id) REFERENCES procurement_receipt_revision(id,receipt_line_id),
  CONSTRAINT fk_receipt_round_inspection FOREIGN KEY(inspection_id,receipt_line_id) REFERENCES quality_inspection_record(id,receipt_line_id),
  CONSTRAINT fk_receipt_round_creator FOREIGN KEY(created_by) REFERENCES users(id),
  CONSTRAINT fk_receipt_round_updater FOREIGN KEY(updated_by) REFERENCES users(id),
  CONSTRAINT chk_receipt_round_quantity CHECK(starting_quantity BETWEEN 0 AND 99999999),
  CONSTRAINT chk_receipt_round_number CHECK(round_no>0 AND version>=0),
  CONSTRAINT chk_receipt_round_trigger CHECK(trigger_type IN('receipt','receipt_correction','review','acceptance_correction','manual_rejection')),
  CONSTRAINT chk_receipt_round_status CHECK(status IN('uninspected','reviewing','reinspection_required','quality_rejected','awaiting_acceptance','finalized','superseded')),
  CONSTRAINT chk_receipt_round_reason CHECK(CHAR_LENGTH(TRIM(reason))>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
ALTER TABLE procurement_receipt_line
  ADD COLUMN current_round_id BIGINT UNSIGNED NULL,
  ADD CONSTRAINT fk_receipt_line_current_round FOREIGN KEY(current_round_id,id) REFERENCES procurement_receipt_round(id,receipt_line_id);

ALTER TABLE quality_inspection_case
  DROP FOREIGN KEY fk_quality_inspection_case_source,
  DROP FOREIGN KEY fk_quality_inspection_case_target,
  DROP FOREIGN KEY fk_quality_inspection_case_superseded,
  DROP CHECK chk_quality_case_source,
  DROP CHECK chk_quality_inspection_case_scope,
  DROP CHECK chk_quality_inspection_case_metadata,
  DROP INDEX uk_quality_inspection_case_target,
  DROP COLUMN source_scope_id,
  DROP COLUMN target_scope_id,
  DROP COLUMN superseded_by_receipt_revision_id,
  ADD COLUMN incoming_round_id BIGINT UNSIGNED NULL,
  ADD COLUMN superseded_by_round_id BIGINT UNSIGNED NULL,
  ADD COLUMN superseded_reason TEXT NULL,
  ADD UNIQUE KEY uk_quality_case_incoming_round(incoming_round_id),
  ADD CONSTRAINT fk_quality_case_incoming_round FOREIGN KEY(incoming_round_id,receipt_line_id) REFERENCES procurement_receipt_round(id,receipt_line_id),
  ADD CONSTRAINT fk_quality_case_superseding_round FOREIGN KEY(superseded_by_round_id,receipt_line_id) REFERENCES procurement_receipt_round(id,receipt_line_id),
  ADD CONSTRAINT chk_quality_case_source CHECK(
    (source_kind='incoming' AND receipt_line_id IS NOT NULL AND receipt_revision_id IS NOT NULL AND incoming_round_id IS NOT NULL
      AND closeout_id IS NULL AND production_batch_id IS NULL AND declared_version IS NULL
      AND declared_available_quantity IS NULL AND declared_extra_quantity IS NULL AND declared_scrap_quantity IS NULL AND declared_quantity>0)
    OR (source_kind='finished' AND closeout_id IS NOT NULL AND production_batch_id IS NOT NULL
      AND receipt_line_id IS NULL AND receipt_revision_id IS NULL AND incoming_round_id IS NULL
      AND superseded_by_round_id IS NULL AND superseded_reason IS NULL
      AND declared_version IS NOT NULL AND declared_version>=0
      AND declared_available_quantity IS NOT NULL AND declared_available_quantity BETWEEN 0 AND 99999999
      AND declared_extra_quantity IS NOT NULL AND declared_extra_quantity BETWEEN 0 AND 99999999
      AND declared_scrap_quantity IS NOT NULL AND declared_scrap_quantity BETWEEN 0 AND 99999999
      AND declared_quantity=declared_available_quantity+declared_extra_quantity)
  ),
  ADD CONSTRAINT chk_quality_inspection_case_metadata CHECK(
    (status='reviewing' AND completed_by IS NULL AND completed_at IS NULL AND superseded_by_round_id IS NULL AND superseded_reason IS NULL)
    OR (status='completed' AND completed_by IS NOT NULL AND completed_at IS NOT NULL AND superseded_by_round_id IS NULL AND superseded_reason IS NULL)
    OR (status='superseded' AND completed_by IS NULL AND completed_at IS NULL AND superseded_by_round_id IS NOT NULL
      AND superseded_reason IS NOT NULL AND CHAR_LENGTH(TRIM(superseded_reason))>0)
  );
ALTER TABLE quality_inspection_record
  DROP CHECK chk_quality_record_quantity,
  DROP CHECK chk_quality_record_measurements,
  MODIFY COLUMN covered_quantity INT NULL,
  ADD CONSTRAINT chk_quality_record_quantity CHECK(qualified_quantity BETWEEN 0 AND 99999999
    AND unqualified_quantity BETWEEN 0 AND 99999999 AND qualified_quantity+unqualified_quantity<=99999999
    AND (covered_quantity IS NULL OR covered_quantity BETWEEN 0 AND 99999999)),
  ADD CONSTRAINT chk_quality_record_measurements CHECK(
    (receipt_line_id IS NOT NULL AND covered_quantity IS NULL AND inspection_method IN('full','sampling')
      AND qualified_quantity+unqualified_quantity>0)
    OR (receipt_line_id IS NULL AND covered_quantity IS NOT NULL AND qualified_quantity+unqualified_quantity<=covered_quantity
      AND ((inspection_method='full' AND covered_quantity>0 AND covered_quantity=qualified_quantity+unqualified_quantity)
        OR (inspection_method='sampling' AND covered_quantity>0 AND qualified_quantity+unqualified_quantity>0)
        OR (inspection_method='zero_confirmation' AND covered_quantity=0 AND qualified_quantity=0 AND unqualified_quantity=0 AND release_decision='released')))
  );

ALTER TABLE procurement_receipt_acceptance
  DROP FOREIGN KEY fk_receipt_acceptance_scope,
  DROP CHECK chk_receipt_acceptance_scope,
  DROP INDEX uk_receipt_acceptance_scope,
  DROP INDEX uk_receipt_acceptance_zero,
  DROP COLUMN zero_scope_inspection_id,
  DROP COLUMN source_scope_id,
  ADD COLUMN round_id BIGINT UNSIGNED NOT NULL,
  ADD COLUMN override_reason TEXT NULL,
  ADD UNIQUE KEY uk_receipt_acceptance_round(round_id),
  ADD CONSTRAINT fk_receipt_acceptance_round FOREIGN KEY(round_id,receipt_line_id) REFERENCES procurement_receipt_round(id,receipt_line_id),
  ADD CONSTRAINT chk_receipt_acceptance_override CHECK(override_reason IS NULL OR CHAR_LENGTH(TRIM(override_reason))>0);
ALTER TABLE procurement_receipt_acceptance_line
  DROP CHECK chk_receipt_acceptance_detail_quality,
  DROP CHECK chk_receipt_acceptance_detail_inbound,
  DROP COLUMN quality_partition,
  ADD CONSTRAINT chk_receipt_acceptance_detail_inbound CHECK(disposition<>'inbound' OR purchase_order_line_id IS NOT NULL);
-- MySQL cannot recreate the same FK name within the ALTER that drops it.
ALTER TABLE procurement_receipt_scope DROP FOREIGN KEY fk_procurement_scope_parent;
ALTER TABLE procurement_receipt_scope
  DROP CHECK chk_procurement_scope_disposition,
  DROP CHECK chk_procurement_scope_transition,
  DROP CHECK chk_procurement_scope_quality,
  DROP CHECK chk_procurement_scope_formal,
  DROP CHECK chk_procurement_scope_inbound_quality,
  DROP COLUMN quality_partition,
  ADD COLUMN round_id BIGINT UNSIGNED NOT NULL,
  ADD COLUMN superseded_by_round_id BIGINT UNSIGNED NULL,
  ADD COLUMN rejection_reason TEXT NULL,
  ADD COLUMN rejected_by BIGINT UNSIGNED NULL,
  ADD COLUMN rejected_at DATETIME NULL,
  ADD UNIQUE KEY uk_receipt_scope_round(id,receipt_line_id,round_id),
  ADD KEY idx_receipt_scope_round(round_id,disposition,id),
  ADD KEY idx_receipt_scope_parent_round(parent_scope_id,receipt_line_id,round_id),
  ADD CONSTRAINT fk_receipt_scope_round FOREIGN KEY(round_id,receipt_line_id) REFERENCES procurement_receipt_round(id,receipt_line_id),
  ADD CONSTRAINT fk_receipt_scope_superseding_round FOREIGN KEY(superseded_by_round_id,receipt_line_id) REFERENCES procurement_receipt_round(id,receipt_line_id),
  ADD CONSTRAINT fk_receipt_scope_rejector FOREIGN KEY(rejected_by) REFERENCES users(id),
  ADD CONSTRAINT chk_procurement_scope_disposition CHECK(disposition IN('pending','approved','quality_return','excess_return','termination_return','manual_rejected','inbounded','returned','superseded')),
  ADD CONSTRAINT chk_procurement_scope_transition CHECK(transition_type IN('split','acceptance','termination','inbound','return','manual_rejection')),
  ADD CONSTRAINT chk_procurement_scope_formal CHECK(
    (disposition IN('superseded','manual_rejected')) OR
    (disposition='returned' AND rejection_reason IS NOT NULL) OR
    (acceptance_line_id IS NOT NULL AND inspection_id IS NOT NULL)
  ),
  ADD CONSTRAINT chk_receipt_scope_rejection CHECK(
    (rejection_reason IS NULL AND rejected_by IS NULL AND rejected_at IS NULL AND disposition<>'manual_rejected') OR
    (rejection_reason IS NOT NULL AND CHAR_LENGTH(TRIM(rejection_reason))>0 AND rejected_by IS NOT NULL AND rejected_at IS NOT NULL
      AND disposition IN('manual_rejected','returned','superseded'))
  ),
  ADD CONSTRAINT chk_receipt_scope_superseded CHECK(superseded_by_round_id IS NULL OR disposition='superseded');
-- The self-reference requires the newly created columns and composite index to be visible.
ALTER TABLE procurement_receipt_scope
  ADD CONSTRAINT fk_procurement_scope_parent FOREIGN KEY(parent_scope_id,receipt_line_id,round_id) REFERENCES procurement_receipt_scope(id,receipt_line_id,round_id);
ALTER TABLE procurement_supplier_return DROP FOREIGN KEY fk_procurement_return_acceptance;
ALTER TABLE procurement_supplier_return
  DROP CHECK chk_procurement_return_reason,
  DROP CHECK chk_procurement_return_inspection,
  MODIFY COLUMN acceptance_line_id BIGINT UNSIGNED NULL,
  ADD CONSTRAINT fk_procurement_return_acceptance FOREIGN KEY(acceptance_line_id,receipt_line_id) REFERENCES procurement_receipt_acceptance_line(id,receipt_line_id),
  ADD CONSTRAINT chk_procurement_return_reason CHECK(reason_type IN('quality','excess','procurement_termination','manual_rejection')),
  ADD CONSTRAINT chk_procurement_return_basis CHECK(reason_type='manual_rejection' OR (acceptance_line_id IS NOT NULL AND inspection_id IS NOT NULL));
