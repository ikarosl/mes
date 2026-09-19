CREATE TEMPORARY TABLE guard_closeout_loss_rollback (ok TINYINT NOT NULL CHECK (ok=1));
INSERT INTO guard_closeout_loss_rollback SELECT IF(
  EXISTS (SELECT 1 FROM item_scrap WHERE loss_purpose='closeout_record')
  OR EXISTS (SELECT 1 FROM approval_instances WHERE subject_type='production_batch_closeout')
  OR EXISTS (SELECT 1 FROM production_output_revision)
  OR EXISTS (SELECT 1 FROM production_batch_closeout WHERE review_snapshot IS NOT NULL),0,1);
DROP TEMPORARY TABLE guard_closeout_loss_rollback;

DROP TRIGGER trg_supplement_reject_closeout_loss_update;
DROP TRIGGER trg_supplement_reject_closeout_loss_insert;
DROP TRIGGER trg_closeout_material_loss_no_delete;
DROP TRIGGER trg_closeout_material_loss_no_update;
DROP TRIGGER trg_closeout_material_loss_insert;
ALTER TABLE item_scrap
  DROP FOREIGN KEY fk_item_scrap_closeout_batch,
  DROP INDEX idx_item_scrap_closeout_batch,
  DROP CHECK chk_item_scrap_loss_purpose,
  DROP COLUMN closeout_id,
  DROP COLUMN loss_purpose;
