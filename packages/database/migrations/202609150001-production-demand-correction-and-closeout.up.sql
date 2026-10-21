-- Pause Production writes while applying this migration. Legacy bulk-close data needs a development reset.
CREATE TEMPORARY TABLE guard_demand_close_semantics (ok TINYINT NOT NULL CHECK (ok=1));
INSERT INTO guard_demand_close_semantics SELECT IF(EXISTS (
  SELECT 1 FROM production_item_demand WHERE business_status='cancelled' AND cancel_source<>'production_batch'
),0,1);
DROP TEMPORARY TABLE guard_demand_close_semantics;

CREATE TABLE production_batch_closeout (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  production_batch_id BIGINT UNSIGNED NOT NULL,
  reason TEXT NOT NULL,
  available_quantity BIGINT UNSIGNED NULL,
  additional_scrap_quantity BIGINT UNSIGNED NULL,
  material_review_note TEXT NULL,
  approval_instance_id BIGINT UNSIGNED NULL,
  pending_approval_id BIGINT UNSIGNED NULL,
  review_snapshot JSON NULL,
  termination_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  version INT NOT NULL DEFAULT 0,
  UNIQUE KEY uk_closeout_batch (production_batch_id),
  UNIQUE KEY uk_closeout_reference (id,production_batch_id),
  UNIQUE KEY uk_closeout_termination (termination_id),
  CONSTRAINT fk_closeout_batch FOREIGN KEY (production_batch_id) REFERENCES production_batches(id),
  CONSTRAINT fk_closeout_approval FOREIGN KEY (approval_instance_id) REFERENCES approval_instances(id),
  CONSTRAINT fk_closeout_pending FOREIGN KEY (pending_approval_id) REFERENCES approval_instances(id),
  CONSTRAINT fk_closeout_termination FOREIGN KEY (termination_id) REFERENCES production_batch_termination(id),
  CONSTRAINT fk_closeout_creator FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_closeout_updater FOREIGN KEY (updated_by) REFERENCES users(id),
  CONSTRAINT chk_closeout_reason CHECK (CHAR_LENGTH(TRIM(reason))>0),
  CONSTRAINT chk_closeout_version CHECK (version>=0),
  CONSTRAINT chk_closeout_output CHECK (
    (available_quantity IS NULL AND additional_scrap_quantity IS NULL AND material_review_note IS NULL)
    OR (available_quantity IS NOT NULL AND additional_scrap_quantity IS NOT NULL
      AND available_quantity+additional_scrap_quantity<=99999999
      AND material_review_note IS NOT NULL AND CHAR_LENGTH(TRIM(material_review_note))>0)
  ),
  CONSTRAINT chk_closeout_pending CHECK (pending_approval_id IS NULL OR
    (approval_instance_id IS NOT NULL AND pending_approval_id=approval_instance_id
     AND termination_id IS NULL AND review_snapshot IS NOT NULL AND available_quantity IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE production_batch_closeout_action (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  closeout_id BIGINT UNSIGNED NOT NULL,
  item_kind VARCHAR(30) NOT NULL,
  target_id BIGINT UNSIGNED NOT NULL,
  label VARCHAR(200) NOT NULL,
  previous_status VARCHAR(40) NOT NULL,
  resulting_status VARCHAR(40) NOT NULL,
  reason TEXT NOT NULL,
  fact_snapshot JSON NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_closeout_action (closeout_id,id),
  CONSTRAINT fk_closeout_action_source FOREIGN KEY (closeout_id) REFERENCES production_batch_closeout(id),
  CONSTRAINT fk_closeout_action_actor FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT chk_closeout_action_kind CHECK (item_kind IN ('step','abnormal','rework','supplement','outbound','demand','allocation','material')),
  CONSTRAINT chk_closeout_action_reason CHECK (CHAR_LENGTH(TRIM(reason))>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TRIGGER trg_closeout_action_no_update BEFORE UPDATE ON production_batch_closeout_action
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Closeout actions are immutable';
CREATE TRIGGER trg_closeout_action_no_delete BEFORE DELETE ON production_batch_closeout_action
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Closeout actions are immutable';

CREATE TABLE production_demand_correction (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  old_demand_id BIGINT UNSIGNED NOT NULL,
  production_batch_id BIGINT UNSIGNED NOT NULL,
  correction_kind VARCHAR(20) NOT NULL,
  target_total_quantity BIGINT UNSIGNED NOT NULL,
  issued_quantity BIGINT UNSIGNED NOT NULL,
  old_remaining_quantity BIGINT UNSIGNED NOT NULL,
  new_remaining_quantity BIGINT UNSIGNED NOT NULL,
  reason TEXT NOT NULL,
  evidence JSON NOT NULL,
  evidence_hash CHAR(64) NOT NULL,
  approval_instance_id BIGINT UNSIGNED NULL,
  new_demand_id BIGINT UNSIGNED NULL,
  applied_by BIGINT UNSIGNED NULL,
  applied_at DATETIME NULL,
  ended_at DATETIME NULL,
  result_snapshot JSON NULL,
  active_slot TINYINT GENERATED ALWAYS AS (CASE WHEN ended_at IS NULL THEN 1 ELSE NULL END) STORED,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  version INT NOT NULL DEFAULT 0,
  UNIQUE KEY uk_correction_active (old_demand_id,active_slot),
  UNIQUE KEY uk_correction_reference (id,old_demand_id),
  UNIQUE KEY uk_correction_approval (approval_instance_id),
  UNIQUE KEY uk_correction_successor (new_demand_id),
  KEY idx_correction_batch (production_batch_id,id),
  CONSTRAINT fk_correction_demand FOREIGN KEY (old_demand_id,production_batch_id) REFERENCES production_item_demand(id,production_batch_id),
  CONSTRAINT fk_correction_successor FOREIGN KEY (new_demand_id,production_batch_id) REFERENCES production_item_demand(id,production_batch_id),
  CONSTRAINT fk_correction_approval FOREIGN KEY (approval_instance_id) REFERENCES approval_instances(id),
  CONSTRAINT fk_correction_creator FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_correction_updater FOREIGN KEY (updated_by) REFERENCES users(id),
  CONSTRAINT fk_correction_applier FOREIGN KEY (applied_by) REFERENCES users(id),
  CONSTRAINT chk_correction_kind CHECK (correction_kind IN ('quantity','close')),
  CONSTRAINT chk_correction_quantities CHECK (target_total_quantity<=99999999 AND old_remaining_quantity>0
    AND target_total_quantity>=issued_quantity AND new_remaining_quantity=target_total_quantity-issued_quantity
    AND (correction_kind<>'close' OR new_remaining_quantity=0)),
  CONSTRAINT chk_correction_reason CHECK (CHAR_LENGTH(TRIM(reason))>0),
  CONSTRAINT chk_correction_version CHECK (version>=0),
  CONSTRAINT chk_correction_effect CHECK (
    (applied_at IS NULL AND applied_by IS NULL AND new_demand_id IS NULL AND result_snapshot IS NULL)
    OR (applied_at IS NOT NULL AND applied_by IS NOT NULL AND ended_at IS NOT NULL
      AND approval_instance_id IS NOT NULL AND result_snapshot IS NOT NULL
      AND ((new_remaining_quantity=0 AND new_demand_id IS NULL) OR (new_remaining_quantity>0 AND new_demand_id IS NOT NULL)))
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE production_item_demand
  DROP CHECK chk_production_item_demand_status,
  DROP CHECK chk_production_item_demand_terminal,
  DROP CHECK chk_production_item_demand_cancel_facts,
  DROP INDEX uk_production_item_demand_supplement_parent,
  ADD COLUMN pending_correction_id BIGINT UNSIGNED NULL,
  ADD COLUMN replaces_demand_id BIGINT UNSIGNED NULL,
  ADD COLUMN close_cause VARCHAR(30) NULL,
  ADD COLUMN close_reason TEXT NULL,
  ADD COLUMN closed_by BIGINT UNSIGNED NULL,
  ADD COLUMN closed_at DATETIME NULL,
  ADD COLUMN close_correction_id BIGINT UNSIGNED NULL,
  ADD COLUMN closeout_id BIGINT UNSIGNED NULL,
  ADD COLUMN original_supplement_parent BIGINT UNSIGNED GENERATED ALWAYS AS
    (CASE WHEN replaces_demand_id IS NULL THEN parent_demand_id ELSE NULL END) STORED,
  ADD UNIQUE KEY uk_demand_replacement (replaces_demand_id),
  ADD UNIQUE KEY uk_demand_supplement_original (supplement_id,original_supplement_parent),
  ADD KEY idx_demand_pending (pending_correction_id,id),
  ADD KEY idx_demand_close_correction (close_correction_id,id),
  ADD KEY idx_demand_closeout (closeout_id,production_batch_id),
  ADD CONSTRAINT fk_demand_pending_correction FOREIGN KEY (pending_correction_id,id) REFERENCES production_demand_correction(id,old_demand_id),
  ADD CONSTRAINT fk_demand_close_correction FOREIGN KEY (close_correction_id,id) REFERENCES production_demand_correction(id,old_demand_id),
  ADD CONSTRAINT fk_demand_closeout FOREIGN KEY (closeout_id,production_batch_id) REFERENCES production_batch_closeout(id,production_batch_id),
  ADD CONSTRAINT fk_demand_replacement FOREIGN KEY (replaces_demand_id) REFERENCES production_item_demand(id),
  ADD CONSTRAINT fk_demand_closer FOREIGN KEY (closed_by) REFERENCES users(id),
  ADD CONSTRAINT chk_production_item_demand_status CHECK (business_status IN ('active','fulfilled','cancelled','closed')),
  ADD CONSTRAINT chk_production_item_demand_terminal CHECK (
    (business_status='active' AND remaining_number>0 AND fulfilled_by IS NULL AND fulfilled_at IS NULL)
    OR (business_status='fulfilled' AND remaining_number=0 AND fulfilled_by IS NOT NULL AND fulfilled_at IS NOT NULL)
    OR (business_status IN ('cancelled','closed') AND fulfilled_by IS NULL AND fulfilled_at IS NULL)
  ),
  ADD CONSTRAINT chk_production_item_demand_cancel_facts CHECK (
    (business_status='cancelled' AND cancel_source='production_batch' AND cancel_reason IS NOT NULL
      AND CHAR_LENGTH(TRIM(cancel_reason))>0 AND cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL)
    OR (business_status<>'cancelled' AND cancel_source IS NULL AND cancel_reason IS NULL AND cancelled_by IS NULL AND cancelled_at IS NULL)
  ),
  ADD CONSTRAINT chk_demand_pending CHECK (pending_correction_id IS NULL OR business_status='active'),
  ADD CONSTRAINT chk_demand_replacement CHECK (replaces_demand_id IS NULL OR demand_type IN ('manual_additional','scrap_supplement')),
  ADD CONSTRAINT chk_demand_close CHECK (
    (business_status='closed' AND remaining_number>0 AND close_cause IS NOT NULL
      AND close_reason IS NOT NULL AND CHAR_LENGTH(TRIM(close_reason))>0 AND closed_by IS NOT NULL AND closed_at IS NOT NULL
      AND ((close_cause IN ('correction_replaced','correction_exhausted','single_close') AND close_correction_id IS NOT NULL AND closeout_id IS NULL)
        OR (close_cause='batch_closeout' AND close_correction_id IS NULL AND closeout_id IS NOT NULL)))
    OR (business_status<>'closed' AND close_cause IS NULL AND close_reason IS NULL AND closed_by IS NULL
      AND closed_at IS NULL AND close_correction_id IS NULL AND closeout_id IS NULL)
  );

ALTER TABLE production_batches DROP CHECK chk_production_batches_status,
  ADD CONSTRAINT chk_production_batches_status CHECK (status IN ('pending','material_pending','material_assigned','material_partially_outbound','material_outbound','doing','completed','cancelled','terminated','closing'));
ALTER TABLE batch_step_records DROP CHECK chk_batch_step_records_status,
  ADD COLUMN closeout_id BIGINT UNSIGNED NULL,
  ADD COLUMN terminated_by BIGINT UNSIGNED NULL,
  ADD COLUMN terminated_at DATETIME NULL,
  ADD COLUMN termination_reason TEXT NULL,
  ADD CONSTRAINT fk_step_closeout FOREIGN KEY (closeout_id,production_batch_id) REFERENCES production_batch_closeout(id,production_batch_id),
  ADD CONSTRAINT fk_step_terminator FOREIGN KEY (terminated_by) REFERENCES users(id),
  ADD CONSTRAINT chk_batch_step_records_status CHECK (status IN ('pending','assigned','doing','completed','terminated')),
  ADD CONSTRAINT chk_step_termination CHECK (
    (status='terminated' AND closeout_id IS NOT NULL AND terminated_by IS NOT NULL AND terminated_at IS NOT NULL
      AND termination_reason IS NOT NULL AND CHAR_LENGTH(TRIM(termination_reason))>0 AND completed_at IS NULL)
    OR (status<>'terminated' AND closeout_id IS NULL AND terminated_by IS NULL AND terminated_at IS NULL AND termination_reason IS NULL)
  );

INSERT INTO permissions (parent_id,name,code,type,route_path,api_method,api_path,sort_order,status)
SELECT id,'申请需求更正与关闭','production:materials:correct-demand','api',NULL,'POST','/api/production/material-demands/:demandId/corrections',91,1
FROM (SELECT id FROM permissions WHERE code='production:materials:view') parent;
