-- Do not discard inspections or approved evidence when reverting the development schema.
CREATE TEMPORARY TABLE guard_output_inspection_method_rollback (ok TINYINT NOT NULL CHECK (ok=1));
INSERT INTO guard_output_inspection_method_rollback SELECT IF(
  EXISTS (SELECT 1 FROM production_output_inspection)
  OR EXISTS (SELECT 1 FROM production_output_revision)
  OR EXISTS (SELECT 1 FROM approval_instances WHERE subject_type='production_batch_closeout')
  OR EXISTS (SELECT 1 FROM production_batch_closeout WHERE review_snapshot IS NOT NULL),0,1);
DROP TEMPORARY TABLE guard_output_inspection_method_rollback;

ALTER TABLE production_output_inspection
  DROP CHECK chk_output_inspection_method,
  DROP CHECK chk_output_inspection_release,
  DROP CHECK chk_output_inspection_scope,
  DROP CHECK chk_output_inspection_quantities,
  DROP CHECK chk_output_inspection_method_quantities;
ALTER TABLE production_output_inspection
  DROP COLUMN inspection_method,
  DROP COLUMN scope_reference,
  DROP COLUMN covered_quantity,
  DROP COLUMN inspected_quantity,
  DROP COLUMN unqualified_quantity,
  DROP COLUMN removed_quantity,
  DROP COLUMN release_decision,
  ADD COLUMN available_quantity BIGINT UNSIGNED NOT NULL AFTER declared_scrap_quantity,
  ADD COLUMN extra_quantity BIGINT UNSIGNED NOT NULL AFTER available_quantity,
  ADD COLUMN additional_scrap_quantity BIGINT UNSIGNED NOT NULL AFTER extra_quantity,
  ADD CONSTRAINT chk_output_inspection_quantities CHECK (
    declared_available_quantity<=99999999 AND declared_extra_quantity<=99999999 AND declared_scrap_quantity<=99999999
    AND available_quantity<=99999999 AND extra_quantity<=99999999 AND additional_scrap_quantity<=99999999
  );
