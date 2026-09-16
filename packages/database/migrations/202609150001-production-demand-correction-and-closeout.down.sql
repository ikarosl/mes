CREATE TEMPORARY TABLE guard_demand_correction_down (ok TINYINT NOT NULL CHECK (ok=1));
INSERT INTO guard_demand_correction_down SELECT IF(
  EXISTS (SELECT 1 FROM production_demand_correction)
  OR EXISTS (SELECT 1 FROM production_batch_closeout)
  OR EXISTS (SELECT 1 FROM production_item_demand WHERE business_status='closed' OR replaces_demand_id IS NOT NULL OR pending_correction_id IS NOT NULL)
  OR EXISTS (SELECT 1 FROM production_batches WHERE status='closing')
  OR EXISTS (SELECT 1 FROM batch_step_records WHERE status='terminated')
  OR EXISTS (SELECT 1 FROM approval_flow_definitions WHERE scene_code IN ('production.demand.correct','production.batch.closeout')),
  0,1);
DROP TEMPORARY TABLE guard_demand_correction_down;

DELETE rp FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE p.code='production:materials:correct-demand';
DELETE FROM permissions WHERE code='production:materials:correct-demand';
ALTER TABLE batch_step_records
  DROP CHECK chk_step_termination,
  DROP CHECK chk_batch_step_records_status,
  DROP FOREIGN KEY fk_step_closeout,
  DROP FOREIGN KEY fk_step_terminator,
  DROP INDEX fk_step_closeout,
  DROP COLUMN closeout_id,
  DROP COLUMN terminated_by,
  DROP COLUMN terminated_at,
  DROP COLUMN termination_reason,
  ADD CONSTRAINT chk_batch_step_records_status CHECK (status IN ('pending','assigned','doing','completed'));
ALTER TABLE production_batches DROP CHECK chk_production_batches_status,
  ADD CONSTRAINT chk_production_batches_status CHECK (status IN ('pending','material_pending','material_assigned','material_partially_outbound','material_outbound','doing','completed','cancelled','terminated'));

ALTER TABLE production_item_demand
  DROP CHECK chk_demand_close,
  DROP CHECK chk_demand_pending,
  DROP CHECK chk_demand_replacement,
  DROP CHECK chk_production_item_demand_status,
  DROP CHECK chk_production_item_demand_terminal,
  DROP CHECK chk_production_item_demand_cancel_facts,
  DROP FOREIGN KEY fk_demand_pending_correction,
  DROP FOREIGN KEY fk_demand_close_correction,
  DROP FOREIGN KEY fk_demand_closeout,
  DROP FOREIGN KEY fk_demand_replacement,
  DROP FOREIGN KEY fk_demand_closer,
  DROP INDEX uk_demand_replacement,
  DROP INDEX uk_demand_supplement_original,
  DROP INDEX idx_demand_pending,
  DROP INDEX idx_demand_close_correction,
  DROP INDEX idx_demand_closeout,
  DROP COLUMN original_supplement_parent,
  DROP COLUMN pending_correction_id,
  DROP COLUMN replaces_demand_id,
  DROP COLUMN close_cause,
  DROP COLUMN close_reason,
  DROP COLUMN closed_by,
  DROP COLUMN closed_at,
  DROP COLUMN close_correction_id,
  DROP COLUMN closeout_id,
  ADD UNIQUE KEY uk_production_item_demand_supplement_parent (supplement_id,parent_demand_id),
  ADD CONSTRAINT chk_production_item_demand_status CHECK (business_status IN ('active','fulfilled','cancelled')),
  ADD CONSTRAINT chk_production_item_demand_terminal CHECK (
    (business_status='active' AND remaining_number>0 AND fulfilled_by IS NULL AND fulfilled_at IS NULL)
    OR (business_status='fulfilled' AND remaining_number=0 AND fulfilled_by IS NOT NULL AND fulfilled_at IS NOT NULL)
    OR (business_status='cancelled' AND fulfilled_by IS NULL AND fulfilled_at IS NULL)
  ),
  ADD CONSTRAINT chk_production_item_demand_cancel_facts CHECK (
    (business_status='cancelled' AND cancel_source IN ('production_batch','short_batch_remaining_close','production_termination')
      AND cancel_reason IS NOT NULL AND CHAR_LENGTH(TRIM(cancel_reason))>0 AND cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL)
    OR (business_status<>'cancelled' AND cancel_source IS NULL AND cancel_reason IS NULL AND cancelled_by IS NULL AND cancelled_at IS NULL)
  );
DROP TABLE production_demand_correction;
DROP TRIGGER trg_closeout_action_no_update;
DROP TRIGGER trg_closeout_action_no_delete;
DROP TABLE production_batch_closeout_action;
DROP TABLE production_batch_closeout;
