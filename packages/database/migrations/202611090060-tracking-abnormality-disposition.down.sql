-- Downgrade only an empty tracking subsystem; never discard settlement facts.
CREATE TEMPORARY TABLE tmp_tracking_disposition_down_guard (
 invalid_data TINYINT NOT NULL,
 CONSTRAINT chk_tracking_disposition_down_empty CHECK(invalid_data=0)
) ENGINE=MEMORY;
INSERT INTO tmp_tracking_disposition_down_guard (invalid_data)
 SELECT 1 WHERE EXISTS(SELECT 1 FROM production_tracking_card)
 OR EXISTS(SELECT 1 FROM production_tracking_visit)
 OR EXISTS(SELECT 1 FROM production_tracking_quantity_change)
 OR EXISTS(SELECT 1 FROM production_tracking_abnormality)
 OR EXISTS(SELECT 1 FROM production_tracking_abnormality_handling)
 OR EXISTS(SELECT 1 FROM production_tracking_scrap_reference)
 OR EXISTS(SELECT 1 FROM production_tracking_output);
DROP TEMPORARY TABLE tmp_tracking_disposition_down_guard;

DROP TRIGGER trg_tracking_scrap_reference_no_update;
DROP TRIGGER trg_tracking_scrap_reference_no_delete;
DROP TRIGGER trg_tracking_abnormality_resolve_once;
DROP TABLE production_tracking_scrap_reference;
ALTER TABLE production_tracking_abnormality_handling
 ADD KEY idx_tracking_handling_abnormality (abnormality_id,id);
ALTER TABLE production_tracking_abnormality_handling
 DROP INDEX uk_tracking_handling_abnormality,
 DROP CHECK chk_tracking_handling_quantities,
 DROP CHECK chk_tracking_handling_card_quantities,
 DROP COLUMN repaired_quantity,
 DROP COLUMN scrapped_quantity,
 DROP COLUMN previous_card_quantity,
 DROP COLUMN remaining_card_quantity,
 ADD COLUMN resolves_abnormality TINYINT(1) NOT NULL AFTER content,
 ADD CONSTRAINT chk_tracking_handling_resolves CHECK(resolves_abnormality IN (0,1));
ALTER TABLE production_tracking_abnormality
 DROP CHECK chk_tracking_abnormality_affected,
 DROP COLUMN affected_quantity,
 ADD COLUMN severity VARCHAR(20) NOT NULL AFTER batch_step_record_id,
 ADD CONSTRAINT chk_tracking_abnormality_severity CHECK(severity IN ('normal','pause'));
ALTER TABLE production_tracking_card
 DROP CHECK chk_tracking_card_quantity,
 DROP CHECK chk_tracking_card_status,
 DROP CHECK chk_tracking_card_scrapped,
 DROP CHECK chk_tracking_card_terminal_quantity,
 ADD CONSTRAINT chk_tracking_card_quantity CHECK(quantity BETWEEN 1 AND 99999999),
 ADD CONSTRAINT chk_tracking_card_status CHECK(status IN ('unused','in_progress','completed','voided'));
DROP TRIGGER trg_tracking_card_output_guard;
CREATE TRIGGER trg_tracking_card_output_guard BEFORE UPDATE ON production_tracking_card FOR EACH ROW BEGIN
 IF OLD.status='completed' OR NEW.card_no<>OLD.card_no OR NEW.production_batch_id<>OLD.production_batch_id OR NEW.personnel_id<>OLD.personnel_id
  OR NEW.personnel_code_snapshot<>OLD.personnel_code_snapshot OR NEW.personnel_name_snapshot<>OLD.personnel_name_snapshot
  OR NEW.created_at<>OLD.created_at OR NEW.created_by<>OLD.created_by THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Tracking card identity and confirmed output cannot be changed';
 END IF;
END;
