-- Experimental branch: affected quantities cannot be inferred from old tracking facts.
-- Stop all tracking/research-output writes; use an isolated empty database.
CREATE TEMPORARY TABLE tmp_tracking_disposition_guard (
 invalid_data TINYINT NOT NULL,
 CONSTRAINT chk_tracking_disposition_empty CHECK(invalid_data=0)
) ENGINE=MEMORY;
INSERT INTO tmp_tracking_disposition_guard (invalid_data)
 SELECT 1 WHERE EXISTS(SELECT 1 FROM production_tracking_card)
 OR EXISTS(SELECT 1 FROM production_tracking_visit)
 OR EXISTS(SELECT 1 FROM production_tracking_quantity_change)
 OR EXISTS(SELECT 1 FROM production_tracking_abnormality)
 OR EXISTS(SELECT 1 FROM production_tracking_abnormality_handling)
 OR EXISTS(SELECT 1 FROM production_tracking_output);
DROP TEMPORARY TABLE tmp_tracking_disposition_guard;

ALTER TABLE production_tracking_card
 DROP CHECK chk_tracking_card_quantity,
 DROP CHECK chk_tracking_card_status,
 ADD CONSTRAINT chk_tracking_card_quantity CHECK(quantity BETWEEN 0 AND 99999999),
 ADD CONSTRAINT chk_tracking_card_status CHECK(status IN ('unused','in_progress','completed','scrapped','voided')),
 ADD CONSTRAINT chk_tracking_card_scrapped CHECK(status<>'scrapped' OR quantity=0),
 ADD CONSTRAINT chk_tracking_card_terminal_quantity CHECK(status NOT IN ('completed','voided') OR quantity>0);

ALTER TABLE production_tracking_abnormality
 DROP CHECK chk_tracking_abnormality_severity,
 DROP COLUMN severity,
 ADD COLUMN affected_quantity INT NOT NULL AFTER batch_step_record_id,
 ADD CONSTRAINT chk_tracking_abnormality_affected CHECK(affected_quantity BETWEEN 1 AND 99999999);

ALTER TABLE production_tracking_abnormality_handling
 DROP CHECK chk_tracking_handling_resolves,
 DROP COLUMN resolves_abnormality,
 ADD COLUMN repaired_quantity INT NOT NULL AFTER content,
 ADD COLUMN scrapped_quantity INT NOT NULL AFTER repaired_quantity,
 ADD COLUMN previous_card_quantity INT NOT NULL AFTER scrapped_quantity,
 ADD COLUMN remaining_card_quantity INT NOT NULL AFTER previous_card_quantity,
 ADD UNIQUE KEY uk_tracking_handling_abnormality (abnormality_id),
 ADD CONSTRAINT chk_tracking_handling_quantities CHECK(repaired_quantity BETWEEN 0 AND 99999999 AND scrapped_quantity BETWEEN 0 AND 99999999),
 ADD CONSTRAINT chk_tracking_handling_card_quantities CHECK(previous_card_quantity BETWEEN 0 AND 99999999 AND remaining_card_quantity BETWEEN 0 AND 99999999 AND remaining_card_quantity=previous_card_quantity-scrapped_quantity AND repaired_quantity+scrapped_quantity<=previous_card_quantity);
ALTER TABLE production_tracking_abnormality_handling DROP INDEX idx_tracking_handling_abnormality;

CREATE TABLE production_tracking_scrap_reference (
 handling_id BIGINT UNSIGNED NOT NULL,
 referenced_handling_id BIGINT UNSIGNED NOT NULL,
 quantity INT NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(handling_id,referenced_handling_id),
 KEY idx_tracking_scrap_reference_source (referenced_handling_id),
 CONSTRAINT fk_tracking_scrap_reference_handling FOREIGN KEY(handling_id) REFERENCES production_tracking_abnormality_handling(id),
 CONSTRAINT fk_tracking_scrap_reference_source FOREIGN KEY(referenced_handling_id) REFERENCES production_tracking_abnormality_handling(id),
 CONSTRAINT chk_tracking_scrap_reference_quantity CHECK(quantity BETWEEN 1 AND 99999999),
 CONSTRAINT chk_tracking_scrap_reference_other CHECK(handling_id<>referenced_handling_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TRIGGER trg_tracking_scrap_reference_no_update BEFORE UPDATE ON production_tracking_scrap_reference FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Tracking scrap references are immutable';
CREATE TRIGGER trg_tracking_scrap_reference_no_delete BEFORE DELETE ON production_tracking_scrap_reference FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Tracking scrap references are immutable';
CREATE TRIGGER trg_tracking_abnormality_resolve_once BEFORE UPDATE ON production_tracking_abnormality FOR EACH ROW BEGIN
 IF OLD.status<>'open' OR NEW.status<>'resolved' OR NEW.resolved_at IS NULL OR NEW.version<>OLD.version+1
  OR NEW.tracking_card_id<>OLD.tracking_card_id OR NEW.production_batch_id<>OLD.production_batch_id OR NOT(NEW.batch_step_record_id<=>OLD.batch_step_record_id)
  OR NEW.affected_quantity<>OLD.affected_quantity OR NEW.description<>OLD.description OR NEW.personnel_id<>OLD.personnel_id
  OR NEW.personnel_code_snapshot<>OLD.personnel_code_snapshot OR NEW.personnel_name_snapshot<>OLD.personnel_name_snapshot
  OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Tracking abnormality discovery is immutable and settles once';
 END IF;
END;
DROP TRIGGER trg_tracking_card_output_guard;
CREATE TRIGGER trg_tracking_card_output_guard BEFORE UPDATE ON production_tracking_card FOR EACH ROW BEGIN
 IF OLD.status IN ('completed','scrapped') OR NEW.card_no<>OLD.card_no OR NEW.production_batch_id<>OLD.production_batch_id OR NEW.personnel_id<>OLD.personnel_id
  OR NEW.personnel_code_snapshot<>OLD.personnel_code_snapshot OR NEW.personnel_name_snapshot<>OLD.personnel_name_snapshot
  OR NEW.created_at<>OLD.created_at OR NEW.created_by<>OLD.created_by THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Tracking card identity and terminal facts cannot be changed';
 END IF;
END;
