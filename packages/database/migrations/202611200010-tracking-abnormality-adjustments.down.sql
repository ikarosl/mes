-- Stop writers. Once new settlement attributes or adjustments exist, restore
-- the matching pre-upgrade backup instead of dropping traceability facts.
CREATE TEMPORARY TABLE tmp_tracking_adjustments_down_guard (
 invalid_data TINYINT NOT NULL,
 CONSTRAINT chk_tracking_adjustments_down_empty CHECK(invalid_data=0)
) ENGINE=MEMORY;
INSERT INTO tmp_tracking_adjustments_down_guard
SELECT 1 WHERE EXISTS(SELECT 1 FROM production_tracking_abnormality_adjustment)
 OR EXISTS(SELECT 1 FROM production_tracking_abnormality_handling WHERE scrap_mode IS NOT NULL);
DROP TEMPORARY TABLE tmp_tracking_adjustments_down_guard;

DROP TRIGGER trg_tracking_card_output_guard;
CREATE TRIGGER trg_tracking_card_output_guard BEFORE UPDATE ON production_tracking_card FOR EACH ROW BEGIN
 DECLARE active_output BIGINT UNSIGNED DEFAULT NULL;
 IF OLD.status='scrapped' OR NEW.card_no<>OLD.card_no OR NEW.production_batch_id<>OLD.production_batch_id OR NEW.personnel_id<>OLD.personnel_id
  OR NEW.personnel_code_snapshot<>OLD.personnel_code_snapshot OR NEW.personnel_name_snapshot<>OLD.personnel_name_snapshot
  OR NEW.created_at<>OLD.created_at OR NEW.created_by<>OLD.created_by OR NEW.version<>OLD.version+1 THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Tracking card identity terminal scrap and version are protected';
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

DROP TABLE production_tracking_abnormality_adjustment_item_mark;
DROP TABLE production_tracking_abnormality_adjustment;
DROP TRIGGER trg_tracking_mark_scrap_no_delete;
DROP TRIGGER trg_tracking_mark_scrap_no_update;
ALTER TABLE production_tracking_abnormality_handling
 DROP CHECK chk_tracking_handling_scrap_mode,
 DROP COLUMN scrap_mode;
