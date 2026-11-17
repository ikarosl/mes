-- Only an empty attachment store can return to the old ownership model.
-- A purged object cannot be recovered by SQL rollback; use a matched database/object backup.
CREATE TEMPORARY TABLE tmp_attachment_down_guard (
 invalid_data TINYINT NOT NULL,
 CONSTRAINT chk_attachment_down_empty CHECK(invalid_data=0)
) ENGINE=MEMORY;
INSERT INTO tmp_attachment_down_guard
SELECT 1 WHERE EXISTS(SELECT 1 FROM attachments) OR EXISTS(SELECT 1 FROM attachment_references);
DROP TEMPORARY TABLE tmp_attachment_down_guard;
DROP TABLE attachment_references;
ALTER TABLE attachments
 DROP CHECK chk_attachments_cleanup,
 DROP INDEX idx_attachments_lifecycle,
 DROP INDEX idx_attachments_type,
 DROP COLUMN cleanup_error_code,
 DROP COLUMN cleanup_completed_at,
 DROP COLUMN cleanup_started_at,
 DROP COLUMN cleanup_status,
 DROP COLUMN version;
RENAME TABLE attachments TO technical_files;
