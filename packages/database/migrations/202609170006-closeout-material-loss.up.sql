-- The approved closeout evidence gains explicit per-record material-loss facts.
-- Reset existing closeout approvals instead of inventing historical evidence.
CREATE TEMPORARY TABLE guard_closeout_loss_evidence (ok TINYINT NOT NULL CHECK (ok=1));
INSERT INTO guard_closeout_loss_evidence SELECT IF(
  EXISTS (SELECT 1 FROM approval_instances WHERE subject_type='production_batch_closeout')
  OR EXISTS (SELECT 1 FROM production_output_revision)
  OR EXISTS (SELECT 1 FROM production_batch_closeout WHERE review_snapshot IS NOT NULL),0,1);
DROP TEMPORARY TABLE guard_closeout_loss_evidence;

ALTER TABLE item_scrap
  ADD COLUMN loss_purpose VARCHAR(30) NOT NULL DEFAULT 'replenishment' AFTER scrap_scene,
  ADD COLUMN closeout_id BIGINT UNSIGNED NULL AFTER loss_purpose,
  ADD KEY idx_item_scrap_closeout_batch (closeout_id,production_batch_id),
  ADD CONSTRAINT fk_item_scrap_closeout_batch FOREIGN KEY (closeout_id,production_batch_id) REFERENCES production_batch_closeout(id,production_batch_id),
  ADD CONSTRAINT chk_item_scrap_loss_purpose CHECK (
    (loss_purpose='replenishment' AND closeout_id IS NULL)
    OR (loss_purpose='closeout_record' AND closeout_id IS NOT NULL AND status='confirmed'
      AND reason_type='closeout_damage' AND remark IS NOT NULL AND CHAR_LENGTH(TRIM(remark))>0)
  );

CREATE TRIGGER trg_closeout_material_loss_insert BEFORE INSERT ON item_scrap
FOR EACH ROW
BEGIN
  IF NEW.loss_purpose='closeout_record' AND NOT EXISTS (
    SELECT 1 FROM production_batch_closeout c JOIN production_batches b ON b.id=c.production_batch_id
    WHERE c.id=NEW.closeout_id AND b.id=NEW.production_batch_id AND b.status='closing'
      AND c.pending_approval_id IS NULL AND c.current_revision_id IS NULL
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Closeout material loss requires an editable initial closing task';
  END IF;
END;

CREATE TRIGGER trg_closeout_material_loss_no_update BEFORE UPDATE ON item_scrap
FOR EACH ROW
BEGIN
  IF OLD.loss_purpose='closeout_record' OR NEW.loss_purpose<>OLD.loss_purpose OR NOT (NEW.closeout_id <=> OLD.closeout_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Confirmed closeout material losses and their purpose are immutable';
  END IF;
END;
CREATE TRIGGER trg_closeout_material_loss_no_delete BEFORE DELETE ON item_scrap
FOR EACH ROW
BEGIN
  IF OLD.loss_purpose='closeout_record' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Confirmed closeout material losses cannot be deleted';
  END IF;
END;

CREATE TRIGGER trg_supplement_reject_closeout_loss_insert BEFORE INSERT ON production_material_supplement
FOR EACH ROW
BEGIN
  IF NEW.source_type='material_loss' AND EXISTS (
    SELECT 1 FROM item_scrap WHERE id=NEW.material_loss_scrap_id AND loss_purpose<>'replenishment'
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Closeout material losses cannot generate replenishment';
  END IF;
END;
CREATE TRIGGER trg_supplement_reject_closeout_loss_update BEFORE UPDATE ON production_material_supplement
FOR EACH ROW
BEGIN
  IF NEW.source_type='material_loss' AND EXISTS (
    SELECT 1 FROM item_scrap WHERE id=NEW.material_loss_scrap_id AND loss_purpose<>'replenishment'
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Closeout material losses cannot generate replenishment';
  END IF;
END;
