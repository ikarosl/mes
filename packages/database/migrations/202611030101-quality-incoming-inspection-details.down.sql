-- Pause inspection writes before checking this guard or changing the shared facts table.
-- Never discard saved inspection details or invent missing notes to satisfy the old schema.
CREATE TEMPORARY TABLE tmp_quality_inspection_details_down_guard (
  incompatible_data TINYINT NOT NULL,
  CONSTRAINT chk_quality_inspection_details_unused CHECK (incompatible_data = 0)
) ENGINE=MEMORY;

INSERT INTO tmp_quality_inspection_details_down_guard (incompatible_data)
SELECT 1
WHERE EXISTS (
  SELECT 1 FROM quality_inspection_record
  WHERE inspection_details IS NOT NULL
    OR result_note IS NULL
    OR CHAR_LENGTH(TRIM(result_note)) = 0
    OR CHAR_LENGTH(TRIM(evidence_reference)) = 0
);

DROP TEMPORARY TABLE tmp_quality_inspection_details_down_guard;

ALTER TABLE quality_inspection_record
  DROP CHECK chk_quality_record_evidence,
  DROP CHECK chk_quality_record_inspection_details,
  DROP COLUMN inspection_details,
  MODIFY COLUMN result_note TEXT NOT NULL,
  ADD CONSTRAINT chk_quality_record_evidence CHECK (
    CHAR_LENGTH(TRIM(result_note)) > 0
    AND CHAR_LENGTH(TRIM(evidence_reference)) > 0
  );
