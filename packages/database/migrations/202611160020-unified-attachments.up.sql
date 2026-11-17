-- Stop attachment uploads, Product configuration and Production task-release writers.
-- This is a one-way ownership switch: no shadow metadata table or old-app dual writes.
CREATE TEMPORARY TABLE tmp_attachment_reference_guard (
 invalid_data TINYINT NOT NULL,
 CONSTRAINT chk_attachment_snapshot_identity CHECK(invalid_data=0)
) ENGINE=MEMORY;
INSERT INTO tmp_attachment_reference_guard
SELECT 1 WHERE EXISTS (
 SELECT 1 FROM process_route_steps s LEFT JOIN technical_files f ON f.id=s.sop_file_id
 WHERE s.sop_object_key_snapshot IS NOT NULL
   AND (f.id IS NULL OR f.object_key<>s.sop_object_key_snapshot)
) OR EXISTS (
 SELECT 1 FROM batch_step_records s LEFT JOIN technical_files f ON f.id=s.sop_file_id_snapshot
 WHERE s.sop_object_key_snapshot IS NOT NULL
   AND (f.id IS NULL OR f.object_key<>s.sop_object_key_snapshot)
) OR EXISTS (
 SELECT 1 FROM batch_step_records s LEFT JOIN technical_files f ON f.id=s.actual_sop_file_id
 WHERE s.actual_sop_object_key_snapshot IS NOT NULL
   AND (f.id IS NULL OR f.object_key<>s.actual_sop_object_key_snapshot)
);
DROP TEMPORARY TABLE tmp_attachment_reference_guard;

RENAME TABLE technical_files TO attachments;
ALTER TABLE attachments
 ADD COLUMN version INT UNSIGNED NOT NULL DEFAULT 0,
 ADD COLUMN cleanup_status VARCHAR(16) NOT NULL DEFAULT 'retained',
 ADD COLUMN cleanup_started_at DATETIME NULL,
 ADD COLUMN cleanup_completed_at DATETIME NULL,
 ADD COLUMN cleanup_error_code VARCHAR(64) NULL,
 ADD CONSTRAINT chk_attachments_cleanup CHECK (
  (cleanup_status='retained' AND cleanup_started_at IS NULL AND cleanup_completed_at IS NULL AND cleanup_error_code IS NULL) OR
  (cleanup_status='processing' AND is_deleted=1 AND cleanup_started_at IS NOT NULL AND cleanup_completed_at IS NULL AND cleanup_error_code IS NULL) OR
  (cleanup_status='failed' AND is_deleted=1 AND cleanup_started_at IS NOT NULL AND cleanup_completed_at IS NULL AND cleanup_error_code IS NOT NULL) OR
  (cleanup_status='completed' AND is_deleted=1 AND cleanup_started_at IS NOT NULL AND cleanup_completed_at IS NOT NULL AND cleanup_error_code IS NULL)
 ),
 ADD INDEX idx_attachments_lifecycle (is_deleted,cleanup_status,id),
 ADD INDEX idx_attachments_type (file_type,id);

CREATE TABLE attachment_references (
 attachment_id BIGINT UNSIGNED NOT NULL,
 owner_type VARCHAR(64) NOT NULL,
 owner_id BIGINT UNSIGNED NOT NULL,
 slot VARCHAR(64) NOT NULL,
 created_by BIGINT UNSIGNED NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (owner_type,owner_id,slot,attachment_id),
 KEY idx_attachment_references_file (attachment_id),
 KEY idx_attachment_references_created_by (created_by),
 CONSTRAINT fk_attachment_references_file FOREIGN KEY (attachment_id) REFERENCES attachments(id) ON DELETE RESTRICT,
 CONSTRAINT fk_attachment_references_creator FOREIGN KEY (created_by) REFERENCES users(id),
 CONSTRAINT chk_attachment_references_identity CHECK (attachment_id>0 AND owner_id>0 AND CHAR_LENGTH(owner_type)>0 AND CHAR_LENGTH(slot)>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Register only relationships proven by persisted identities. Registration time is NOW;
-- the original human binding time/actor is unknown and is not reconstructed or invented.
-- Retain disabled/soft-deleted owners and both historical SOP slots conservatively.
INSERT INTO attachment_references(attachment_id,owner_type,owner_id,slot,created_by)
SELECT default_sop_file_id,'product_process_step',id,'default_sop',NULL FROM process_steps WHERE default_sop_file_id IS NOT NULL;
INSERT INTO attachment_references(attachment_id,owner_type,owner_id,slot,created_by)
SELECT sop_file_id,'product_route_step',id,'sop',NULL FROM process_route_steps WHERE sop_file_id IS NOT NULL;
INSERT INTO attachment_references(attachment_id,owner_type,owner_id,slot,created_by)
SELECT specification_file_id,'product',id,'specification',NULL FROM products WHERE specification_file_id IS NOT NULL;
INSERT INTO attachment_references(attachment_id,owner_type,owner_id,slot,created_by)
SELECT specification_file_id,'material_variant',id,'specification',NULL FROM material_variants WHERE specification_file_id IS NOT NULL;
INSERT INTO attachment_references(attachment_id,owner_type,owner_id,slot,created_by)
SELECT sop_file_id_snapshot,'production_batch_step',id,'default_sop',NULL FROM batch_step_records WHERE sop_file_id_snapshot IS NOT NULL;
INSERT INTO attachment_references(attachment_id,owner_type,owner_id,slot,created_by)
SELECT actual_sop_file_id,'production_batch_step',id,'actual_sop',NULL FROM batch_step_records WHERE actual_sop_file_id IS NOT NULL;
