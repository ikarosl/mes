-- Confirming material losses records damage only; rebuild development business data.
-- Pause Production and closeout approval writes during this non-transactional DDL.
CREATE TEMPORARY TABLE guard_material_loss_record_only (ok TINYINT NOT NULL CHECK (ok=1));
INSERT INTO guard_material_loss_record_only SELECT IF(
  EXISTS (SELECT 1 FROM item_scrap)
  OR EXISTS (SELECT 1 FROM production_item_demand)
  OR EXISTS (SELECT 1 FROM production_material_supplement)
  OR EXISTS (SELECT 1 FROM production_output_revision)
  OR EXISTS (SELECT 1 FROM approval_instances WHERE subject_type='production_batch_closeout')
  OR EXISTS (SELECT 1 FROM production_batch_closeout WHERE review_snapshot IS NOT NULL),0,1);
DROP TEMPORARY TABLE guard_material_loss_record_only;

DROP TRIGGER trg_supplement_reject_closeout_loss_update;
DROP TRIGGER trg_supplement_reject_closeout_loss_insert;
DROP TRIGGER trg_closeout_material_loss_no_update;
DROP TRIGGER trg_closeout_material_loss_no_delete;

ALTER TABLE production_material_supplement
  DROP FOREIGN KEY fk_production_material_supplement_step_scrap,
  DROP FOREIGN KEY fk_production_material_supplement_material_loss,
  DROP INDEX fk_production_material_supplement_material_loss,
  DROP INDEX uk_production_material_supplement_material_loss,
  DROP CHECK chk_production_material_supplement_source;
ALTER TABLE production_material_supplement
  DROP COLUMN material_loss_scrap_id,
  MODIFY COLUMN step_scrap_record_id BIGINT UNSIGNED NOT NULL,
  MODIFY COLUMN batch_step_record_id BIGINT UNSIGNED NOT NULL,
  ADD CONSTRAINT fk_production_material_supplement_step_scrap FOREIGN KEY (
    step_scrap_record_id,production_batch_id,batch_step_record_id
  ) REFERENCES batch_step_scrap_records(id,production_batch_id,batch_step_record_id),
  ADD CONSTRAINT chk_production_material_supplement_source CHECK (
    source_type='step_scrap_reproduction' AND step_scrap_record_id IS NOT NULL AND batch_step_record_id IS NOT NULL
  );

ALTER TABLE item_scrap
  DROP CHECK chk_item_scrap_loss_purpose;
ALTER TABLE item_scrap
  ALTER COLUMN loss_purpose SET DEFAULT 'production_record',
  ADD CONSTRAINT chk_item_scrap_loss_purpose CHECK (
    (loss_purpose='production_record' AND closeout_id IS NULL)
    OR (loss_purpose='closeout_record' AND closeout_id IS NOT NULL AND status='confirmed'
      AND reason_type='closeout_damage' AND remark IS NOT NULL AND CHAR_LENGTH(TRIM(remark))>0)
  );

ALTER TABLE production_item_demand
  DROP CHECK chk_production_item_demand_type,
  DROP CHECK chk_production_item_demand_source,
  DROP CHECK chk_production_item_demand_generation_group_key;
ALTER TABLE production_item_demand
  ADD CONSTRAINT chk_production_item_demand_type CHECK (demand_type IN ('normal','manual_additional','scrap_supplement')),
  ADD CONSTRAINT chk_production_item_demand_source CHECK (
    (demand_type='normal' AND parent_demand_id IS NULL AND manual_addition_id IS NULL AND supplement_id IS NULL)
    OR (demand_type='manual_additional' AND parent_demand_id IS NULL AND manual_addition_id IS NOT NULL AND supplement_id IS NULL)
    OR (demand_type='scrap_supplement' AND parent_demand_id IS NOT NULL AND manual_addition_id IS NULL AND supplement_id IS NOT NULL)
  ),
  ADD CONSTRAINT chk_production_item_demand_generation_group_key CHECK (
    idempotency_key LIKE CONCAT(generation_group_key, ':%')
    AND ((demand_type='normal' AND generation_group_key LIKE 'NORMAL:%')
      OR (demand_type='manual_additional' AND generation_group_key LIKE 'ADDITIONAL:%')
      OR (demand_type='scrap_supplement' AND generation_group_key LIKE 'SCRAPSUP:%'))
  );

CREATE TRIGGER trg_closeout_material_loss_no_update BEFORE UPDATE ON item_scrap
FOR EACH ROW
BEGIN
  IF OLD.status<>'pending' OR NEW.status NOT IN ('confirmed','cancelled')
    OR NEW.loss_purpose<>OLD.loss_purpose OR NOT (NEW.closeout_id <=> OLD.closeout_id)
    OR NEW.production_batch_id<>OLD.production_batch_id OR NEW.demand_id<>OLD.demand_id
    OR NEW.allocation_id<>OLD.allocation_id OR NEW.item_id<>OLD.item_id
    OR NEW.material_variant_id<>OLD.material_variant_id OR NEW.batch_id<>OLD.batch_id
    OR NEW.scrap_scene<>OLD.scrap_scene OR NEW.scrap_number<>OLD.scrap_number
    OR NEW.scrap_no<>OLD.scrap_no OR NEW.unit_snapshot<>OLD.unit_snapshot
    OR NEW.reason_type<>OLD.reason_type OR NOT (NEW.remark <=> OLD.remark)
    OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at
    OR NEW.version<>OLD.version+1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Material loss source and terminal facts are immutable';
  END IF;
END;
CREATE TRIGGER trg_closeout_material_loss_no_delete BEFORE DELETE ON item_scrap
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Material loss records cannot be deleted';
