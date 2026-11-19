-- Stop the same writers and verify the matching backup. Never use down to repair a
-- partially applied up. Existing observations are business facts, even when all of
-- their descriptions also remain in the legacy display snapshot.
CREATE TEMPORARY TABLE tmp_tracking_label_down_guard (
 invalid_data TINYINT NOT NULL,
 CONSTRAINT chk_tracking_label_downgrade_empty CHECK(invalid_data=0)
) ENGINE=MEMORY;
INSERT INTO tmp_tracking_label_down_guard
SELECT 1 WHERE EXISTS(SELECT 1 FROM production_tracking_abnormality_label)
 OR EXISTS(SELECT 1 FROM production_tracking_abnormality_label_assignment)
 OR EXISTS(SELECT 1 FROM production_tracking_abnormality WHERE OCTET_LENGTH(description)>65535);
DROP TEMPORARY TABLE tmp_tracking_label_down_guard;

DROP TRIGGER trg_tracking_label_assignment_no_delete;
DROP TRIGGER trg_tracking_label_assignment_no_update;
DROP TRIGGER trg_tracking_label_no_delete;
DROP TRIGGER trg_tracking_label_no_update;
DROP TRIGGER trg_tracking_label_hash_guard;
DROP TABLE production_tracking_abnormality_label_assignment;
DROP TABLE production_tracking_abnormality_label;
ALTER TABLE production_tracking_abnormality MODIFY COLUMN description TEXT NOT NULL;
