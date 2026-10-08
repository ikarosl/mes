-- New finished measurements lack verified batch totals; never fabricate those for rollback.
CREATE TEMPORARY TABLE guard_finished_measurements (ok TINYINT NOT NULL CHECK (ok=1));
INSERT INTO guard_finished_measurements SELECT IF(
  EXISTS (SELECT 1 FROM quality_inspection_case WHERE source_kind='finished')
  OR EXISTS (SELECT 1 FROM quality_inspection_record WHERE production_batch_id IS NOT NULL)
  OR EXISTS (SELECT 1 FROM production_output_revision)
  OR EXISTS (SELECT 1 FROM approval_instances WHERE subject_type='production_batch_closeout')
  OR EXISTS (SELECT 1 FROM production_batch_closeout WHERE review_snapshot IS NOT NULL),0,1);
DROP TEMPORARY TABLE guard_finished_measurements;

ALTER TABLE quality_inspection_record
  DROP CHECK chk_quality_record_quantity,
  DROP CHECK chk_quality_record_measurements,
  ADD CONSTRAINT chk_quality_record_quantity CHECK (
    qualified_quantity BETWEEN 0 AND 99999999
    AND unqualified_quantity BETWEEN 0 AND 99999999 AND qualified_quantity+unqualified_quantity<=99999999
    AND (covered_quantity IS NULL OR covered_quantity BETWEEN 0 AND 99999999)
  ),
  ADD CONSTRAINT chk_quality_record_measurements CHECK (
    (receipt_line_id IS NOT NULL AND covered_quantity IS NULL AND inspection_method IN ('full','sampling')
      AND qualified_quantity+unqualified_quantity>0)
    OR (receipt_line_id IS NULL AND covered_quantity IS NOT NULL AND qualified_quantity+unqualified_quantity<=covered_quantity
      AND ((inspection_method='full' AND covered_quantity>0 AND covered_quantity=qualified_quantity+unqualified_quantity)
        OR (inspection_method='sampling' AND covered_quantity>0 AND qualified_quantity+unqualified_quantity>0)
        OR (inspection_method='zero_confirmation' AND covered_quantity=0 AND qualified_quantity=0 AND unqualified_quantity=0 AND release_decision='released')))
  );
