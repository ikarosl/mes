-- Specification files use their original names and do not have managed versions.
-- SOP versions remain mandatory for route and production snapshots.
ALTER TABLE technical_files
  MODIFY COLUMN version_no VARCHAR(64) NULL;

UPDATE technical_files
SET file_name = original_name, version_no = NULL
WHERE file_type = 'specification';

ALTER TABLE technical_files
  ADD CONSTRAINT chk_technical_files_version
    CHECK (
      (file_type = 'sop' AND version_no IS NOT NULL)
      OR (file_type = 'specification' AND version_no IS NULL)
    );
