-- No historical loss/demand/approval facts may be discarded or assigned old replenishment meaning.
CREATE TEMPORARY TABLE guard_material_loss_record_only (ok TINYINT NOT NULL CHECK (ok=1));
INSERT INTO guard_material_loss_record_only SELECT IF(
  EXISTS (SELECT 1 FROM item_scrap)
  OR EXISTS (SELECT 1 FROM production_item_demand)
  OR EXISTS (SELECT 1 FROM production_material_supplement)
  OR EXISTS (SELECT 1 FROM production_output_revision)
  OR EXISTS (SELECT 1 FROM approval_instances WHERE subject_type='production_batch_closeout')
  OR EXISTS (SELECT 1 FROM production_batch_closeout WHERE review_snapshot IS NOT NULL),0,1);
DROP TEMPORARY TABLE guard_material_loss_record_only;

DROP TRIGGER trg_closeout_material_loss_no_update;
DROP TRIGGER trg_closeout_material_loss_no_delete;

ALTER TABLE production_material_supplement
  DROP FOREIGN KEY fk_production_material_supplement_step_scrap,
  DROP CHECK chk_production_material_supplement_source;
ALTER TABLE production_material_supplement
  MODIFY COLUMN step_scrap_record_id BIGINT UNSIGNED NULL,
  MODIFY COLUMN batch_step_record_id BIGINT UNSIGNED NULL,
  ADD COLUMN material_loss_scrap_id BIGINT UNSIGNED NULL AFTER step_scrap_record_id,
  ADD UNIQUE KEY uk_production_material_supplement_material_loss (material_loss_scrap_id),
  ADD CONSTRAINT fk_production_material_supplement_step_scrap FOREIGN KEY (
    step_scrap_record_id,production_batch_id,batch_step_record_id
  ) REFERENCES batch_step_scrap_records(id,production_batch_id,batch_step_record_id),
  ADD CONSTRAINT fk_production_material_supplement_material_loss FOREIGN KEY (
    material_loss_scrap_id,production_batch_id
  ) REFERENCES item_scrap(id,production_batch_id),
  ADD CONSTRAINT chk_production_material_supplement_source CHECK (
    (source_type='step_scrap_reproduction' AND step_scrap_record_id IS NOT NULL
      AND material_loss_scrap_id IS NULL AND batch_step_record_id IS NOT NULL)
    OR (source_type='material_loss' AND step_scrap_record_id IS NULL
      AND material_loss_scrap_id IS NOT NULL AND batch_step_record_id IS NULL)
  );

ALTER TABLE item_scrap
  DROP CHECK chk_item_scrap_loss_purpose;
ALTER TABLE item_scrap
  ALTER COLUMN loss_purpose SET DEFAULT 'replenishment',
  ADD CONSTRAINT chk_item_scrap_loss_purpose CHECK (
    (loss_purpose='replenishment' AND closeout_id IS NULL)
    OR (loss_purpose='closeout_record' AND closeout_id IS NOT NULL AND status='confirmed'
      AND reason_type='closeout_damage' AND remark IS NOT NULL AND CHAR_LENGTH(TRIM(remark))>0)
  );

ALTER TABLE production_item_demand
  DROP CHECK chk_production_item_demand_type,
  DROP CHECK chk_production_item_demand_source,
  DROP CHECK chk_production_item_demand_generation_group_key;
ALTER TABLE production_item_demand
  ADD CONSTRAINT chk_production_item_demand_type CHECK (demand_type IN ('normal','manual_additional','scrap_supplement','material_loss_supplement')),
  ADD CONSTRAINT chk_production_item_demand_source CHECK (
    (demand_type='normal' AND parent_demand_id IS NULL AND manual_addition_id IS NULL AND supplement_id IS NULL)
    OR (demand_type='manual_additional' AND parent_demand_id IS NULL AND manual_addition_id IS NOT NULL AND supplement_id IS NULL)
    OR (demand_type IN ('scrap_supplement','material_loss_supplement') AND parent_demand_id IS NOT NULL AND manual_addition_id IS NULL AND supplement_id IS NOT NULL)
  ),
  ADD CONSTRAINT chk_production_item_demand_generation_group_key CHECK (
    idempotency_key LIKE CONCAT(generation_group_key, ':%')
    AND ((demand_type='normal' AND generation_group_key LIKE 'NORMAL:%')
      OR (demand_type='manual_additional' AND generation_group_key LIKE 'ADDITIONAL:%')
      OR (demand_type='scrap_supplement' AND generation_group_key LIKE 'SCRAPSUP:%')
      OR (demand_type='material_loss_supplement' AND generation_group_key LIKE 'LOSSSUP:%'))
  );

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
