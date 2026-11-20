-- Stop tracking and output writers and take a restore-verified backup.
-- Existing settlements keep their original facts and a NULL scrap mode.
ALTER TABLE production_tracking_abnormality_handling
 ADD COLUMN scrap_mode VARCHAR(16) NULL AFTER scrapped_quantity,
 ADD CONSTRAINT chk_tracking_handling_scrap_mode CHECK(scrap_mode IN ('quantity_only','item_marked'));

CREATE TABLE production_tracking_abnormality_adjustment (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
 abnormality_id BIGINT UNSIGNED NOT NULL,
 version INT NOT NULL,
 kind VARCHAR(8) NOT NULL,
 previous_scrapped_quantity INT NOT NULL,
 scrapped_quantity INT NOT NULL,
 previous_card_version INT NOT NULL,
 previous_card_quantity INT NOT NULL,
 card_quantity INT NOT NULL,
 reason TEXT NOT NULL,
 created_by BIGINT UNSIGNED NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (id),
 UNIQUE KEY uk_tracking_adjustment_version (abnormality_id,version),
 KEY fk_tracking_adjustment_actor (created_by),
 CONSTRAINT fk_tracking_adjustment_abnormality FOREIGN KEY (abnormality_id) REFERENCES production_tracking_abnormality(id),
 CONSTRAINT fk_tracking_adjustment_actor FOREIGN KEY (created_by) REFERENCES users(id),
 CONSTRAINT chk_tracking_adjustment_versions CHECK(version>1 AND previous_card_version>=0),
 CONSTRAINT chk_tracking_adjustment_kind CHECK(
  (kind='correct' AND previous_scrapped_quantity>0 AND scrapped_quantity>0) OR
  (kind='void' AND scrapped_quantity=0)
 ),
 CONSTRAINT chk_tracking_adjustment_quantities CHECK(
  previous_scrapped_quantity BETWEEN 0 AND 99999999 AND scrapped_quantity BETWEEN 0 AND 99999999 AND
  previous_card_quantity BETWEEN 0 AND 99999999 AND card_quantity BETWEEN 0 AND 99999999 AND
  card_quantity=previous_card_quantity+previous_scrapped_quantity-scrapped_quantity
 )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE production_tracking_abnormality_adjustment_item_mark (
 adjustment_id BIGINT UNSIGNED NOT NULL,
 set_kind VARCHAR(6) NOT NULL,
 item_mark_id BIGINT UNSIGNED NOT NULL,
 mark_code_snapshot VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 PRIMARY KEY (adjustment_id,set_kind,item_mark_id),
 KEY fk_tracking_adjustment_mark_item (item_mark_id),
 CONSTRAINT fk_tracking_adjustment_mark_adjustment FOREIGN KEY (adjustment_id) REFERENCES production_tracking_abnormality_adjustment(id),
 CONSTRAINT fk_tracking_adjustment_mark_item FOREIGN KEY (item_mark_id) REFERENCES production_tracking_item_mark(id),
 CONSTRAINT chk_tracking_adjustment_mark_set CHECK(set_kind IN ('before','after'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TRIGGER trg_tracking_mark_scrap_no_update BEFORE UPDATE ON production_tracking_item_mark_scrap FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Tracking mark scrap facts are immutable';
CREATE TRIGGER trg_tracking_mark_scrap_no_delete BEFORE DELETE ON production_tracking_item_mark_scrap FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Tracking mark scrap facts are immutable';
CREATE TRIGGER trg_tracking_adjustment_no_update BEFORE UPDATE ON production_tracking_abnormality_adjustment FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Tracking abnormality adjustments are immutable';
CREATE TRIGGER trg_tracking_adjustment_no_delete BEFORE DELETE ON production_tracking_abnormality_adjustment FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Tracking abnormality adjustments are immutable';
CREATE TRIGGER trg_tracking_adjustment_mark_no_update BEFORE UPDATE ON production_tracking_abnormality_adjustment_item_mark FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Tracking adjustment mark snapshots are immutable';
CREATE TRIGGER trg_tracking_adjustment_mark_no_delete BEFORE DELETE ON production_tracking_abnormality_adjustment_item_mark FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Tracking adjustment mark snapshots are immutable';

DROP TRIGGER trg_tracking_card_output_guard;
CREATE TRIGGER trg_tracking_card_output_guard BEFORE UPDATE ON production_tracking_card FOR EACH ROW BEGIN
 DECLARE active_output BIGINT UNSIGNED DEFAULT NULL;
 DECLARE scrap_adjustment BIGINT UNSIGNED DEFAULT NULL;
 IF NEW.card_no<>OLD.card_no OR NEW.production_batch_id<>OLD.production_batch_id OR NEW.personnel_id<>OLD.personnel_id
  OR NEW.personnel_code_snapshot<>OLD.personnel_code_snapshot OR NEW.personnel_name_snapshot<>OLD.personnel_name_snapshot
  OR NEW.created_at<>OLD.created_at OR NEW.created_by<>OLD.created_by OR NEW.version<>OLD.version+1 THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Tracking card identity and version are protected';
 END IF;
 IF OLD.status='scrapped' THEN
  SELECT d.id INTO scrap_adjustment FROM production_tracking_abnormality a
   JOIN production_tracking_abnormality_adjustment d ON d.abnormality_id=a.id
   WHERE a.tracking_card_id=OLD.id AND d.previous_card_version=OLD.version
    AND d.previous_card_quantity=OLD.quantity AND d.card_quantity=NEW.quantity AND d.created_by=NEW.updated_by
   LIMIT 1 FOR SHARE;
  IF scrap_adjustment IS NULL
   OR NEW.status<>IF(NEW.quantity=0,'scrapped',IF(OLD.current_step_record_id IS NULL,'unused','in_progress'))
   OR NOT(NEW.current_step_record_id<=>OLD.current_step_record_id) OR NOT(NEW.remark<=>OLD.remark)
   OR NOT(NEW.void_reason<=>OLD.void_reason) OR NOT(NEW.voided_at<=>OLD.voided_at)
   OR NOT(NEW.voided_by<=>OLD.voided_by) THEN
   SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Scrapped cards change only through a recorded abnormality adjustment';
  END IF;
 END IF;
 IF OLD.status='completed' THEN
  SELECT output.id INTO active_output FROM production_tracking_output output
   LEFT JOIN production_tracking_output_cancellation cancellation ON cancellation.production_output_id=output.id
   WHERE output.tracking_card_id=OLD.id AND cancellation.id IS NULL ORDER BY output.id LIMIT 1 FOR SHARE;
  IF NEW.status<>'in_progress' OR NEW.quantity<>OLD.quantity OR NOT(NEW.current_step_record_id<=>OLD.current_step_record_id)
   OR NOT(NEW.remark<=>OLD.remark) OR active_output IS NOT NULL
   OR NOT EXISTS(SELECT 1 FROM production_tracking_output output JOIN production_tracking_output_cancellation cancellation
      ON cancellation.production_output_id=output.id WHERE output.tracking_card_id=OLD.id) THEN
   SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Completed cards restore only after their unreceived output is cancelled';
  END IF;
 END IF;
END;
