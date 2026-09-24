-- Refuse to erase facts recorded under the new quantity authorization model.
CREATE TEMPORARY TABLE guard_receipt_rounds_down (ok TINYINT NOT NULL CHECK(ok=1));
INSERT INTO guard_receipt_rounds_down SELECT IF(EXISTS(SELECT 1 FROM procurement_receipt)
  OR EXISTS(SELECT 1 FROM procurement_receipt_round)
  OR EXISTS(SELECT 1 FROM quality_inspection_case WHERE source_kind='incoming'),0,1);
DROP TEMPORARY TABLE guard_receipt_rounds_down;

-- Recreate same-name foreign keys only after their DROP statement has completed.
ALTER TABLE procurement_supplier_return DROP FOREIGN KEY fk_procurement_return_acceptance;
ALTER TABLE procurement_supplier_return
  DROP CHECK chk_procurement_return_basis,
  DROP CHECK chk_procurement_return_reason,
  MODIFY COLUMN acceptance_line_id BIGINT UNSIGNED NOT NULL,
  ADD CONSTRAINT fk_procurement_return_acceptance FOREIGN KEY(acceptance_line_id,receipt_line_id) REFERENCES procurement_receipt_acceptance_line(id,receipt_line_id),
  ADD CONSTRAINT chk_procurement_return_reason CHECK(reason_type IN('quality','excess','procurement_termination')),
  ADD CONSTRAINT chk_procurement_return_inspection CHECK(reason_type<>'quality' OR inspection_id IS NOT NULL);
ALTER TABLE procurement_receipt_scope DROP FOREIGN KEY fk_procurement_scope_parent;
ALTER TABLE procurement_receipt_scope
  DROP FOREIGN KEY fk_receipt_scope_round,
  DROP FOREIGN KEY fk_receipt_scope_superseding_round,
  DROP FOREIGN KEY fk_receipt_scope_rejector,
  DROP CHECK chk_procurement_scope_disposition,
  DROP CHECK chk_procurement_scope_transition,
  DROP CHECK chk_procurement_scope_formal,
  DROP CHECK chk_receipt_scope_rejection,
  DROP CHECK chk_receipt_scope_superseded,
  DROP INDEX idx_receipt_scope_round,
  DROP INDEX idx_receipt_scope_parent_round,
  DROP INDEX uk_receipt_scope_round,
  DROP COLUMN round_id,
  DROP COLUMN superseded_by_round_id,
  DROP COLUMN rejection_reason,
  DROP COLUMN rejected_by,
  DROP COLUMN rejected_at,
  ADD COLUMN quality_partition VARCHAR(30) NOT NULL DEFAULT 'held',
  ADD CONSTRAINT chk_procurement_scope_quality CHECK(quality_partition IN('released','unqualified','held')),
  ADD CONSTRAINT chk_procurement_scope_disposition CHECK(disposition IN('uninspected','reviewing','awaiting_acceptance','pending','approved','quality_return','excess_return','termination_return','inbounded','returned','superseded')),
  ADD CONSTRAINT chk_procurement_scope_transition CHECK(transition_type IN('receipt','split','inspection','review','receipt_correction','acceptance','termination','inbound','return')),
  ADD CONSTRAINT chk_procurement_scope_formal CHECK(disposition NOT IN('approved','quality_return','excess_return','termination_return','pending','inbounded','returned') OR acceptance_line_id IS NOT NULL),
  ADD CONSTRAINT chk_procurement_scope_inbound_quality CHECK(disposition NOT IN('approved','inbounded') OR quality_partition='released');
ALTER TABLE procurement_receipt_scope
  ADD CONSTRAINT fk_procurement_scope_parent FOREIGN KEY(parent_scope_id,receipt_line_id) REFERENCES procurement_receipt_scope(id,receipt_line_id);
ALTER TABLE procurement_receipt_acceptance_line
  DROP CHECK chk_receipt_acceptance_detail_inbound,
  ADD COLUMN quality_partition VARCHAR(30) NOT NULL,
  ADD CONSTRAINT chk_receipt_acceptance_detail_quality CHECK(quality_partition IN('released','unqualified','held')),
  ADD CONSTRAINT chk_receipt_acceptance_detail_inbound CHECK(disposition<>'inbound' OR (purchase_order_line_id IS NOT NULL AND quality_partition='released'));
ALTER TABLE procurement_receipt_acceptance
  DROP FOREIGN KEY fk_receipt_acceptance_round,
  DROP CHECK chk_receipt_acceptance_override,
  DROP INDEX uk_receipt_acceptance_round,
  DROP COLUMN round_id,
  DROP COLUMN override_reason,
  ADD COLUMN source_scope_id BIGINT UNSIGNED NULL,
  ADD COLUMN zero_scope_inspection_id BIGINT UNSIGNED GENERATED ALWAYS AS (IF(source_scope_id IS NULL,inspection_record_id,NULL)) STORED,
  ADD UNIQUE KEY uk_receipt_acceptance_scope(source_scope_id),
  ADD UNIQUE KEY uk_receipt_acceptance_zero(zero_scope_inspection_id),
  ADD CONSTRAINT fk_receipt_acceptance_scope FOREIGN KEY(source_scope_id,receipt_line_id) REFERENCES procurement_receipt_scope(id,receipt_line_id),
  ADD CONSTRAINT chk_receipt_acceptance_scope CHECK(source_scope_id IS NOT NULL OR confirmed_scope_quantity=0);
ALTER TABLE quality_inspection_record
  DROP CHECK chk_quality_record_quantity,
  DROP CHECK chk_quality_record_measurements,
  MODIFY COLUMN covered_quantity INT NOT NULL,
  ADD CONSTRAINT chk_quality_record_quantity CHECK(covered_quantity BETWEEN 0 AND 99999999
    AND qualified_quantity BETWEEN 0 AND 99999999 AND unqualified_quantity BETWEEN 0 AND 99999999
    AND qualified_quantity+unqualified_quantity<=covered_quantity),
  ADD CONSTRAINT chk_quality_record_measurements CHECK(
    (inspection_method='full' AND covered_quantity>0 AND covered_quantity=qualified_quantity+unqualified_quantity)
    OR (inspection_method='sampling' AND covered_quantity>0 AND qualified_quantity+unqualified_quantity>0)
    OR (inspection_method='zero_confirmation' AND covered_quantity=0 AND qualified_quantity=0 AND unqualified_quantity=0 AND release_decision='released')
  );
ALTER TABLE quality_inspection_case
  DROP FOREIGN KEY fk_quality_case_incoming_round,
  DROP FOREIGN KEY fk_quality_case_superseding_round,
  DROP CHECK chk_quality_case_source,
  DROP CHECK chk_quality_inspection_case_metadata,
  DROP INDEX uk_quality_case_incoming_round,
  DROP COLUMN incoming_round_id,
  DROP COLUMN superseded_by_round_id,
  DROP COLUMN superseded_reason,
  ADD COLUMN source_scope_id BIGINT UNSIGNED NULL,
  ADD COLUMN target_scope_id BIGINT UNSIGNED NULL,
  ADD COLUMN superseded_by_receipt_revision_id BIGINT UNSIGNED NULL,
  ADD UNIQUE KEY uk_quality_inspection_case_target(target_scope_id),
  ADD CONSTRAINT fk_quality_inspection_case_source FOREIGN KEY(source_scope_id,receipt_line_id) REFERENCES procurement_receipt_scope(id,receipt_line_id),
  ADD CONSTRAINT fk_quality_inspection_case_target FOREIGN KEY(target_scope_id,receipt_line_id) REFERENCES procurement_receipt_scope(id,receipt_line_id),
  ADD CONSTRAINT fk_quality_inspection_case_superseded FOREIGN KEY(superseded_by_receipt_revision_id,receipt_line_id) REFERENCES procurement_receipt_revision(id,receipt_line_id),
  ADD CONSTRAINT chk_quality_case_source CHECK(
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
  ADD CONSTRAINT chk_quality_inspection_case_scope CHECK(
    source_kind='finished' OR (((declared_quantity=0 AND case_type='receipt_correction' AND target_scope_id IS NULL)
      OR (declared_quantity>0 AND target_scope_id IS NOT NULL))
      AND (source_scope_id IS NOT NULL OR case_type='receipt_correction'))
  ),
  ADD CONSTRAINT chk_quality_inspection_case_metadata CHECK(
    (status='reviewing' AND completed_by IS NULL AND completed_at IS NULL AND superseded_by_receipt_revision_id IS NULL)
    OR (status='completed' AND completed_by IS NOT NULL AND completed_at IS NOT NULL AND superseded_by_receipt_revision_id IS NULL)
    OR (status='superseded' AND completed_by IS NULL AND completed_at IS NULL AND superseded_by_receipt_revision_id IS NOT NULL)
  );
ALTER TABLE procurement_receipt_line
  DROP FOREIGN KEY fk_receipt_line_current_round,
  DROP COLUMN current_round_id;
DROP TABLE procurement_receipt_round;
