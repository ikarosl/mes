-- Experimental tracking-card branch: retire the old production inspection model.
-- Stop Production and Quality writes before applying. Incoming inspection facts are retained.
-- The retired facts have no lossless conversion to tracking cards, so reject nonempty sources.
CREATE TEMPORARY TABLE tmp_retire_production_quality_guard (
  invalid_data TINYINT NOT NULL,
  CONSTRAINT chk_retire_production_quality_empty CHECK (invalid_data = 0)
) ENGINE=MEMORY;
INSERT INTO tmp_retire_production_quality_guard (invalid_data)
SELECT 1 WHERE EXISTS (SELECT 1 FROM quality_process_inspection)
   OR EXISTS (SELECT 1 FROM quality_process_inspection_record)
   OR EXISTS (SELECT 1 FROM quality_inspection_case WHERE source_kind <> 'incoming')
   OR EXISTS (SELECT 1 FROM quality_inspection_record WHERE closeout_id IS NOT NULL OR production_batch_id IS NOT NULL);
DROP TEMPORARY TABLE tmp_retire_production_quality_guard;

-- Production owns these references; release them before removing their Quality targets.
-- The following Production retirement migration removes the empty source tables.
ALTER TABLE batch_step_abnormal_dispositions
  DROP FOREIGN KEY fk_abnormal_disposition_inspection,
  DROP FOREIGN KEY fk_abnormal_disposition_inspection_record;
ALTER TABLE production_batch_closeout DROP FOREIGN KEY fk_closeout_inspection;
ALTER TABLE production_output_revision DROP FOREIGN KEY fk_output_revision_inspection;

ALTER TABLE quality_process_inspection DROP FOREIGN KEY fk_process_inspection_current;
DROP TABLE quality_process_inspection_record;
DROP TABLE quality_process_inspection;

ALTER TABLE quality_inspection_record
  DROP FOREIGN KEY fk_quality_record_finished,
  DROP FOREIGN KEY fk_quality_record_previous_finished,
  DROP CHECK chk_quality_record_source,
  DROP CHECK chk_quality_record_measurements,
  DROP INDEX uk_quality_record_finished,
  DROP INDEX idx_quality_record_batch,
  DROP INDEX fk_quality_record_finished,
  DROP INDEX fk_quality_record_previous_finished,
  DROP COLUMN closeout_id,
  DROP COLUMN production_batch_id,
  ADD CONSTRAINT chk_quality_record_source CHECK (receipt_line_id IS NOT NULL AND receipt_revision_id IS NOT NULL),
  ADD CONSTRAINT chk_quality_record_measurements CHECK (
    covered_quantity IS NULL
    AND inspection_method IN ('full', 'sampling')
    AND qualified_quantity + unqualified_quantity > 0
  );

ALTER TABLE quality_inspection_case
  DROP FOREIGN KEY fk_quality_case_finished,
  DROP FOREIGN KEY fk_quality_case_finished_round,
  DROP CHECK chk_quality_case_source,
  DROP INDEX uk_quality_case_finished,
  DROP INDEX uk_quality_case_finished_round,
  DROP INDEX idx_quality_case_finished,
  DROP INDEX fk_quality_case_finished,
  DROP INDEX fk_quality_case_finished_round,
  DROP COLUMN closeout_id,
  DROP COLUMN production_batch_id,
  DROP COLUMN finished_round_id,
  DROP COLUMN declared_version,
  DROP COLUMN declared_available_quantity,
  DROP COLUMN declared_extra_quantity,
  DROP COLUMN declared_scrap_quantity,
  ADD CONSTRAINT chk_quality_case_source CHECK (
    source_kind = 'incoming'
    AND receipt_line_id IS NOT NULL
    AND receipt_revision_id IS NOT NULL
    AND incoming_round_id IS NOT NULL
    AND declared_quantity > 0
  );
