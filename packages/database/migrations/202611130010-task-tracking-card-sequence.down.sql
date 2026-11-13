-- Stop all tracking/task writers. Never use this down to compensate a partially applied up.
-- A committed sequence cannot be removed even if its cards were subsequently voided.
CREATE TEMPORARY TABLE tmp_task_tracking_number_down_guard (
 invalid_data TINYINT NOT NULL,
 CONSTRAINT chk_task_tracking_number_unused CHECK(invalid_data=0)
) ENGINE=MEMORY;
INSERT INTO tmp_task_tracking_number_down_guard
SELECT 1 WHERE EXISTS(SELECT 1 FROM production_tracking_card_sequence WHERE last_sequence>0);
DROP TEMPORARY TABLE tmp_task_tracking_number_down_guard;

DROP TRIGGER trg_tracking_card_sequence_update_guard;
DROP TRIGGER trg_tracking_card_sequence_no_delete;
DROP TABLE production_tracking_card_sequence;
