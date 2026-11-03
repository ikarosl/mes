-- Pause writes to the shared inspection facts table and take a verified backup before upgrading.
-- Preserve historical notes; only new incoming facts use a table instead of result_note.
-- Existing inspection_details stay SQL NULL; no historical content is inferred or backfilled.
ALTER TABLE quality_inspection_record
  DROP CHECK chk_quality_record_evidence,
  MODIFY COLUMN result_note TEXT NULL,
  ADD COLUMN inspection_details JSON NULL DEFAULT NULL AFTER evidence_reference,
  ADD CONSTRAINT chk_quality_record_evidence CHECK (
    CHAR_LENGTH(TRIM(evidence_reference)) > 0
    AND (
      (receipt_line_id IS NOT NULL AND result_note IS NULL AND inspection_details IS NOT NULL)
      OR (result_note IS NOT NULL AND CHAR_LENGTH(TRIM(result_note)) > 0)
    )
  ),
  ADD CONSTRAINT chk_quality_record_inspection_details CHECK (
    inspection_details IS NULL OR (
      JSON_TYPE(inspection_details) = 'OBJECT'
      AND JSON_LENGTH(inspection_details) = 2
      AND COALESCE(JSON_TYPE(JSON_EXTRACT(inspection_details, '$.columns')), 'NULL') = 'ARRAY'
      AND JSON_LENGTH(JSON_EXTRACT(inspection_details, '$.columns')) BETWEEN 1 AND 20
      AND COALESCE(JSON_TYPE(JSON_EXTRACT(inspection_details, '$.rows')), 'NULL') = 'ARRAY'
      AND JSON_LENGTH(JSON_EXTRACT(inspection_details, '$.rows')) BETWEEN 1 AND 200
    )
  );
