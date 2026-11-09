-- Experimental branch only: no execution-history conversion is provided.
-- The old model must be empty; use a new isolated database for this experiment.
CREATE TEMPORARY TABLE tmp_tracking_retirement_guard (
 invalid_data TINYINT NOT NULL,
 CONSTRAINT chk_tracking_retirement_empty CHECK(invalid_data=0)
) ENGINE=MEMORY;
INSERT INTO tmp_tracking_retirement_guard (invalid_data)
 SELECT 1 WHERE EXISTS(SELECT 1 FROM production_batches);
DROP TEMPORARY TABLE tmp_tracking_retirement_guard;

DROP TRIGGER trg_closeout_material_loss_insert;
DROP TRIGGER trg_closeout_material_loss_no_update;
DROP TRIGGER trg_closeout_material_loss_no_delete;
ALTER TABLE batch_step_abnormal_dispositions
  DROP FOREIGN KEY fk_abnormal_disposition_step,
  DROP FOREIGN KEY fk_batch_step_abnormal_dispositions_created_by,
  DROP FOREIGN KEY fk_batch_step_abnormal_dispositions_report,
  DROP FOREIGN KEY fk_batch_step_abnormal_dispositions_reviewer,
  DROP FOREIGN KEY fk_batch_step_abnormal_dispositions_updated_by;
ALTER TABLE batch_step_execution_actions
  DROP FOREIGN KEY fk_step_execution_action_actor,
  DROP FOREIGN KEY fk_step_execution_action_source;
ALTER TABLE batch_step_records
  DROP FOREIGN KEY fk_batch_step_records_default_responsible,
  DROP FOREIGN KEY fk_batch_step_records_responsible,
  DROP FOREIGN KEY fk_step_closeout,
  DROP FOREIGN KEY fk_step_terminator;
ALTER TABLE batch_step_reports
  DROP FOREIGN KEY fk_batch_step_reports_created_by,
  DROP FOREIGN KEY fk_batch_step_reports_replacement,
  DROP FOREIGN KEY fk_batch_step_reports_reversal,
  DROP FOREIGN KEY fk_batch_step_reports_step;
ALTER TABLE batch_step_scrap_records
  DROP FOREIGN KEY fk_batch_step_scrap_records_created_by,
  DROP FOREIGN KEY fk_batch_step_scrap_records_disposition_source,
  DROP FOREIGN KEY fk_step_scrap_disposition_step;
ALTER TABLE batch_step_scrap_reproduction_authorization
  DROP FOREIGN KEY fk_scrap_reproduction_authorization_authorized_by,
  DROP FOREIGN KEY fk_scrap_reproduction_authorization_entry_step,
  DROP FOREIGN KEY fk_scrap_reproduction_authorization_scrap,
  DROP FOREIGN KEY fk_scrap_reproduction_authorization_supplement;
ALTER TABLE item_scrap
  DROP FOREIGN KEY fk_item_scrap_closeout_batch;
ALTER TABLE production_batch_closeout
  DROP FOREIGN KEY fk_closeout_approval,
  DROP FOREIGN KEY fk_closeout_batch,
  DROP FOREIGN KEY fk_closeout_creator,
  DROP FOREIGN KEY fk_closeout_current_revision,
  DROP FOREIGN KEY fk_closeout_current_round,
  DROP FOREIGN KEY fk_closeout_pending,
  DROP FOREIGN KEY fk_closeout_updater;
ALTER TABLE production_batch_closeout_action
  DROP FOREIGN KEY fk_closeout_action_actor,
  DROP FOREIGN KEY fk_closeout_action_source;
ALTER TABLE production_batches
  DROP FOREIGN KEY fk_production_batch_execution_completed_by;
ALTER TABLE production_item_demand
  DROP FOREIGN KEY fk_demand_closeout,
  DROP FOREIGN KEY fk_production_item_demand_parent,
  DROP FOREIGN KEY fk_production_item_demand_supplement;
ALTER TABLE production_material_supplement
  DROP FOREIGN KEY fk_production_material_supplement_created_by,
  DROP FOREIGN KEY fk_production_material_supplement_fulfilled_by,
  DROP FOREIGN KEY fk_production_material_supplement_step_scrap,
  DROP FOREIGN KEY fk_production_material_supplement_updated_by;
ALTER TABLE production_output_allocation
  DROP FOREIGN KEY fk_output_allocation_creator,
  DROP FOREIGN KEY fk_output_allocation_revision;
ALTER TABLE production_output_revision
  DROP FOREIGN KEY fk_output_revision_actor,
  DROP FOREIGN KEY fk_output_revision_approval,
  DROP FOREIGN KEY fk_output_revision_order,
  DROP FOREIGN KEY fk_output_revision_previous,
  DROP FOREIGN KEY fk_output_revision_product,
  DROP FOREIGN KEY fk_output_revision_round,
  DROP FOREIGN KEY fk_output_revision_source;
ALTER TABLE production_output_round
  DROP FOREIGN KEY fk_output_round_base,
  DROP FOREIGN KEY fk_output_round_closeout,
  DROP FOREIGN KEY fk_output_round_creator,
  DROP FOREIGN KEY fk_output_round_previous,
  DROP FOREIGN KEY fk_output_round_updater;
ALTER TABLE production_scrap_supplement_plan
  DROP FOREIGN KEY fk_production_scrap_supplement_plan_created_by,
  DROP FOREIGN KEY fk_production_scrap_supplement_plan_disposition,
  DROP FOREIGN KEY fk_production_scrap_supplement_plan_supplement,
  DROP FOREIGN KEY fk_production_scrap_supplement_plan_updated_by,
  DROP FOREIGN KEY fk_scrap_plan_disposition_step;
ALTER TABLE production_scrap_supplement_plan_line
  DROP FOREIGN KEY fk_production_scrap_supplement_plan_line_created_by,
  DROP FOREIGN KEY fk_production_scrap_supplement_plan_line_demand,
  DROP FOREIGN KEY fk_production_scrap_supplement_plan_line_plan,
  DROP FOREIGN KEY fk_production_scrap_supplement_plan_line_updated_by,
  DROP FOREIGN KEY fk_scrap_supplement_plan_line_basis,
  DROP FOREIGN KEY fk_scrap_supplement_plan_line_basis_demand,
  DROP FOREIGN KEY fk_scrap_supplement_plan_line_variant;
ALTER TABLE rework_records
  DROP FOREIGN KEY fk_rework_disposition_step,
  DROP FOREIGN KEY fk_rework_records_completed_abnormal_report,
  DROP FOREIGN KEY fk_rework_records_completed_normal_report,
  DROP FOREIGN KEY fk_rework_records_created_by,
  DROP FOREIGN KEY fk_rework_records_disposition_source,
  DROP FOREIGN KEY fk_rework_records_responsible_user,
  DROP FOREIGN KEY fk_rework_records_source_report,
  DROP FOREIGN KEY fk_rework_records_step,
  DROP FOREIGN KEY fk_rework_records_updated_by;
ALTER TABLE batch_step_records
  DROP INDEX idx_batch_step_records_responsible_status,
  DROP INDEX idx_batch_step_records_default_responsible,
  DROP INDEX fk_step_closeout,
  DROP INDEX fk_step_terminator,
  DROP CHECK chk_batch_step_records_completed,
  DROP CHECK chk_batch_step_records_flags,
  DROP CHECK chk_batch_step_records_status,
  DROP CHECK chk_step_termination,
  DROP COLUMN default_responsible_user_id_snapshot,
  DROP COLUMN responsible_user_id,
  DROP COLUMN need_inspection_snapshot,
  DROP COLUMN status,
  DROP COLUMN started_at,
  DROP COLUMN completed_at,
  DROP COLUMN closeout_id,
  DROP COLUMN terminated_by,
  DROP COLUMN terminated_at,
  DROP COLUMN termination_reason;
ALTER TABLE item_scrap
  DROP INDEX idx_item_scrap_closeout_batch,
  DROP CHECK chk_item_scrap_loss_purpose,
  DROP COLUMN loss_purpose,
  DROP COLUMN closeout_id;
ALTER TABLE production_batches
  DROP INDEX fk_production_batch_execution_completed_by,
  DROP CHECK chk_production_batch_execution_completed,
  DROP COLUMN execution_completed_at,
  DROP COLUMN execution_completed_by;
ALTER TABLE production_demand_correction
  DROP CHECK chk_correction_effect,
  DROP COLUMN result_snapshot;
ALTER TABLE production_item_demand
  DROP INDEX uk_demand_supplement_original,
  DROP INDEX idx_production_item_demand_parent,
  DROP INDEX idx_production_item_demand_supplement,
  DROP INDEX fk_production_item_demand_parent,
  DROP INDEX fk_production_item_demand_supplement,
  DROP INDEX idx_demand_closeout,
  DROP CHECK chk_demand_close,
  DROP CHECK chk_production_item_demand_source,
  DROP COLUMN parent_demand_id,
  DROP COLUMN supplement_id,
  DROP COLUMN closeout_id,
  DROP COLUMN original_supplement_parent;
DROP TABLE batch_step_abnormal_dispositions;
DROP TABLE batch_step_execution_actions;
DROP TABLE batch_step_reports;
DROP TABLE batch_step_scrap_records;
DROP TABLE batch_step_scrap_reproduction_authorization;
DROP TABLE production_batch_closeout;
DROP TABLE production_batch_closeout_action;
DROP TABLE production_material_supplement;
DROP TABLE production_output_allocation;
DROP TABLE production_output_revision;
DROP TABLE production_output_round;
DROP TABLE production_scrap_supplement_plan;
DROP TABLE production_scrap_supplement_plan_line;
DROP TABLE rework_records;

ALTER TABLE work_orders
 DROP CHECK chk_work_orders_close_type,
 ADD CONSTRAINT chk_work_orders_close_type CHECK(close_type IS NULL OR close_type IN ('unproduced','underproduced','completed_archive'));

ALTER TABLE production_batches
 DROP CHECK chk_production_batches_status,
 ADD CONSTRAINT chk_production_batches_status CHECK(status IN ('pending','material_pending','material_assigned','material_partially_outbound','material_outbound','doing','completed','cancelled')),
 ADD CONSTRAINT chk_tracking_task_finish CHECK ((status='completed' AND finish_reason IS NOT NULL AND CHAR_LENGTH(TRIM(finish_reason))>0) OR (status<>'completed' AND finish_reason IS NULL));
ALTER TABLE production_demand_correction
 ADD CONSTRAINT chk_correction_effect CHECK(
  (applied_at IS NULL AND applied_by IS NULL AND new_demand_id IS NULL) OR
  (applied_at IS NOT NULL AND applied_by IS NOT NULL AND ended_at IS NOT NULL AND approval_instance_id IS NOT NULL
   AND ((new_remaining_quantity=0 AND new_demand_id IS NULL) OR (new_remaining_quantity>0 AND new_demand_id IS NOT NULL))));
ALTER TABLE production_item_demand
 DROP CHECK chk_demand_replacement,
 DROP CHECK chk_production_item_demand_type,
 DROP CHECK chk_production_item_demand_generation_group_key,
 ADD CONSTRAINT chk_demand_replacement CHECK(replaces_demand_id IS NULL OR demand_type='manual_additional'),
 ADD CONSTRAINT chk_tracking_demand_source CHECK((demand_type='normal' AND manual_addition_id IS NULL) OR (demand_type='manual_additional' AND manual_addition_id IS NOT NULL)),
 ADD CONSTRAINT chk_production_item_demand_type CHECK(demand_type IN ('normal','manual_additional')),
 ADD CONSTRAINT chk_production_item_demand_generation_group_key CHECK(idempotency_key LIKE CONCAT(generation_group_key,':%') AND ((demand_type='normal' AND generation_group_key LIKE 'NORMAL:%') OR (demand_type='manual_additional' AND generation_group_key LIKE 'ADDITIONAL:%'))),
 ADD CONSTRAINT chk_tracking_demand_close CHECK(
  (business_status='closed' AND remaining_number>0 AND close_reason IS NOT NULL AND CHAR_LENGTH(TRIM(close_reason))>0 AND closed_by IS NOT NULL AND closed_at IS NOT NULL AND
    ((close_cause IN ('correction_replaced','correction_exhausted','single_close') AND close_correction_id IS NOT NULL) OR (close_cause='task_finished' AND close_correction_id IS NULL))) OR
  (business_status<>'closed' AND close_cause IS NULL AND close_reason IS NULL AND closed_by IS NULL AND closed_at IS NULL AND close_correction_id IS NULL));

CREATE TRIGGER trg_tracking_output_no_update BEFORE UPDATE ON production_tracking_output FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Tracking output is immutable';
CREATE TRIGGER trg_tracking_output_no_delete BEFORE DELETE ON production_tracking_output FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Tracking output is immutable';
CREATE TRIGGER trg_tracking_quantity_no_update BEFORE UPDATE ON production_tracking_quantity_change FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Tracking quantity history is immutable';
CREATE TRIGGER trg_tracking_quantity_no_delete BEFORE DELETE ON production_tracking_quantity_change FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Tracking quantity history is immutable';
CREATE TRIGGER trg_tracking_handling_no_update BEFORE UPDATE ON production_tracking_abnormality_handling FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Tracking handling facts are immutable';
CREATE TRIGGER trg_tracking_handling_no_delete BEFORE DELETE ON production_tracking_abnormality_handling FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Tracking handling facts are immutable';
CREATE TRIGGER trg_tracking_visit_no_delete BEFORE DELETE ON production_tracking_visit FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Tracking visits cannot be deleted';
CREATE TRIGGER trg_tracking_visit_complete_once BEFORE UPDATE ON production_tracking_visit FOR EACH ROW BEGIN
 IF OLD.completed_at IS NOT NULL OR NEW.completed_at IS NULL OR NEW.completed_by IS NULL OR NEW.reported_quantity IS NULL
  OR NEW.tracking_card_id<>OLD.tracking_card_id OR NEW.production_batch_id<>OLD.production_batch_id OR NEW.batch_step_record_id<>OLD.batch_step_record_id
  OR NEW.personnel_id<>OLD.personnel_id OR NEW.personnel_code_snapshot<>OLD.personnel_code_snapshot OR NEW.personnel_name_snapshot<>OLD.personnel_name_snapshot
  OR NEW.arrived_by<>OLD.arrived_by OR NEW.arrived_at<>OLD.arrived_at THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Tracking visit identity is immutable and completion is recorded once';
 END IF;
END;
CREATE TRIGGER trg_tracking_card_output_guard BEFORE UPDATE ON production_tracking_card FOR EACH ROW BEGIN
 IF OLD.status='completed' OR NEW.card_no<>OLD.card_no OR NEW.production_batch_id<>OLD.production_batch_id OR NEW.personnel_id<>OLD.personnel_id
  OR NEW.personnel_code_snapshot<>OLD.personnel_code_snapshot OR NEW.personnel_name_snapshot<>OLD.personnel_name_snapshot
  OR NEW.created_at<>OLD.created_at OR NEW.created_by<>OLD.created_by THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Tracking card identity and confirmed output cannot be changed';
 END IF;
END;
CREATE TRIGGER trg_tracking_card_used_no_delete BEFORE DELETE ON production_tracking_card FOR EACH ROW BEGIN
 IF OLD.status<>'unused' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Used tracking cards cannot be deleted'; END IF;
END;
CREATE TRIGGER trg_material_loss_terminal_guard BEFORE UPDATE ON item_scrap FOR EACH ROW BEGIN
 IF OLD.status<>'pending' OR NEW.status NOT IN ('confirmed','cancelled')
  OR NEW.production_batch_id<>OLD.production_batch_id OR NEW.demand_id<>OLD.demand_id OR NEW.allocation_id<>OLD.allocation_id
  OR NEW.item_id<>OLD.item_id OR NEW.material_variant_id<>OLD.material_variant_id OR NEW.batch_id<>OLD.batch_id
  OR NEW.scrap_scene<>OLD.scrap_scene OR NEW.scrap_number<>OLD.scrap_number OR NEW.scrap_no<>OLD.scrap_no
  OR NEW.unit_snapshot<>OLD.unit_snapshot OR NEW.reason_type<>OLD.reason_type OR NOT(NEW.remark<=>OLD.remark)
  OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at OR NEW.version<>OLD.version+1 THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Material loss source and terminal facts are immutable';
 END IF;
END;
CREATE TRIGGER trg_material_loss_no_delete BEFORE DELETE ON item_scrap FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Material loss records cannot be deleted';
