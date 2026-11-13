-- Preserve all existing cards, visits and platform daily counters. Stop tracking/task writers
-- and take a verified backup with its matching application before this additive migration.
-- A pre-existing card in a task's new namespace needs explicit resolution; never infer a
-- historical sequence, renumber a card or silently skip its occupied suffix.
CREATE TEMPORARY TABLE tmp_task_tracking_number_preflight (
 invalid_data TINYINT NOT NULL,
 CONSTRAINT chk_task_tracking_number_namespace_free CHECK(invalid_data=0)
) ENGINE=MEMORY;
INSERT INTO tmp_task_tracking_number_preflight
SELECT 1 WHERE EXISTS(
 SELECT 1 FROM production_tracking_card card JOIN production_batches task
  ON LEFT(card.card_no,CHAR_LENGTH(task.batch_no)+3)=CONCAT(task.batch_no,'-k-')
);
DROP TEMPORARY TABLE tmp_task_tracking_number_preflight;

CREATE TABLE production_tracking_card_sequence (
 production_batch_id BIGINT UNSIGNED NOT NULL,
 last_sequence BIGINT UNSIGNED NOT NULL DEFAULT 0,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY(production_batch_id),
 CONSTRAINT fk_tracking_card_sequence_batch FOREIGN KEY(production_batch_id)
  REFERENCES production_batches(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 CONSTRAINT chk_tracking_card_sequence_nonnegative CHECK(last_sequence>=0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TRIGGER trg_tracking_card_sequence_update_guard BEFORE UPDATE ON production_tracking_card_sequence
FOR EACH ROW BEGIN
 IF NEW.production_batch_id<>OLD.production_batch_id OR NEW.last_sequence<OLD.last_sequence
  OR NEW.created_at<>OLD.created_at THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Tracking card sequence identity is fixed and cannot decrease';
 END IF;
END;
CREATE TRIGGER trg_tracking_card_sequence_no_delete BEFORE DELETE ON production_tracking_card_sequence
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Tracking card sequences cannot be deleted or reused';
