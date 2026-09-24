-- Development schema switch: old quality facts cannot be reinterpreted as full inspections.
-- Pause Production and closeout approval writes before applying either direction.
CREATE TEMPORARY TABLE guard_output_inspection_method (ok TINYINT NOT NULL CHECK (ok=1));
INSERT INTO guard_output_inspection_method SELECT IF(
  EXISTS (SELECT 1 FROM production_output_inspection)
  OR EXISTS (SELECT 1 FROM production_output_revision)
  OR EXISTS (SELECT 1 FROM approval_instances WHERE subject_type='production_batch_closeout')
  OR EXISTS (SELECT 1 FROM production_batch_closeout WHERE review_snapshot IS NOT NULL),0,1);
DROP TEMPORARY TABLE guard_output_inspection_method;

ALTER TABLE production_output_inspection
  DROP CHECK chk_output_inspection_quantities;
ALTER TABLE production_output_inspection
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

-- Qualified and released quantities are derived from these immutable facts, never client supplied.
