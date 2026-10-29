-- Removed specification names and versions cannot be reconstructed.
-- Reject before permanent DDL rather than inventing historical metadata.
CREATE TEMPORARY TABLE tmp_specification_file_metadata_rollback_guard (
  must_be_zero TINYINT NOT NULL,
  CONSTRAINT chk_specification_file_metadata_rollback_guard CHECK (must_be_zero = 0)
) ENGINE=MEMORY;

INSERT INTO tmp_specification_file_metadata_rollback_guard (must_be_zero)
SELECT 1 WHERE EXISTS (SELECT 1 FROM technical_files WHERE file_type = 'specification');

DROP TEMPORARY TABLE tmp_specification_file_metadata_rollback_guard;

ALTER TABLE technical_files
  DROP CHECK chk_technical_files_version,
  MODIFY COLUMN version_no VARCHAR(64) NOT NULL;
