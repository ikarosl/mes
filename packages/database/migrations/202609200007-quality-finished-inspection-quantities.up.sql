-- Simplified facts cannot silently reinterpret old exclusions or frozen approval evidence.
-- Pause Quality finished inspection, Production closeout and related Approval writes.
CREATE TEMPORARY TABLE guard_finished_inspection_quantities (ok TINYINT NOT NULL CHECK (ok=1));
INSERT INTO guard_finished_inspection_quantities SELECT IF(
  EXISTS (SELECT 1 FROM quality_finished_inspection)
  OR EXISTS (SELECT 1 FROM production_output_revision)
  OR EXISTS (SELECT 1 FROM approval_instances WHERE subject_type='production_batch_closeout')
  OR EXISTS (SELECT 1 FROM production_batch_closeout WHERE review_snapshot IS NOT NULL),0,1);
DROP TEMPORARY TABLE guard_finished_inspection_quantities;

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
-- N=G+F is normalized from explicit good/bad input; persist C,N,F only.
-- For explicit release, L=C-F; other decisions have L=0. Source declarations remain reference snapshots.
