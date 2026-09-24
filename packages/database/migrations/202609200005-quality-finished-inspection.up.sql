-- Move the single immutable fact table; all existing references are preserved by MySQL.
-- Pause Production closeout, Quality inspection and approval writes during DDL.
DROP TRIGGER trg_output_inspection_no_update;
DROP TRIGGER trg_output_inspection_no_delete;
RENAME TABLE production_output_inspection TO quality_finished_inspection;
CREATE TRIGGER trg_quality_finished_inspection_no_update BEFORE UPDATE ON quality_finished_inspection
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Finished inspection records are immutable';
CREATE TRIGGER trg_quality_finished_inspection_no_delete BEFORE DELETE ON quality_finished_inspection
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Finished inspection records are immutable';
CREATE INDEX idx_quality_finished_batch ON quality_finished_inspection(production_batch_id,id);
