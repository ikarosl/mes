CREATE TABLE production_batch_termination (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  production_batch_id BIGINT UNSIGNED NOT NULL,
  work_order_id BIGINT UNSIGNED NOT NULL,
  planned_quantity DECIMAL(12,4) NOT NULL,
  available_quantity DECIMAL(12,4) NOT NULL,
  additional_scrap_quantity DECIMAL(12,4) NOT NULL,
  existing_scrap_quantity DECIMAL(12,4) NOT NULL,
  reason TEXT NOT NULL,
  material_review_note TEXT NOT NULL,
  review_snapshot JSON NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_production_batch_termination_batch (production_batch_id),
  KEY idx_production_batch_termination_order (work_order_id,created_at,id),
  CONSTRAINT fk_production_batch_termination_source FOREIGN KEY (production_batch_id,work_order_id) REFERENCES production_batches(id,work_order_id),
  CONSTRAINT fk_production_batch_termination_actor FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT chk_production_batch_termination_quantities CHECK (
    planned_quantity > 0 AND planned_quantity = TRUNCATE(planned_quantity,0)
    AND available_quantity >= 0 AND available_quantity = TRUNCATE(available_quantity,0)
    AND additional_scrap_quantity >= 0 AND additional_scrap_quantity = TRUNCATE(additional_scrap_quantity,0)
    AND existing_scrap_quantity >= 0 AND existing_scrap_quantity = TRUNCATE(existing_scrap_quantity,0)
    AND available_quantity + additional_scrap_quantity + existing_scrap_quantity <= 99999999
  ),
  CONSTRAINT chk_production_batch_termination_reason CHECK (CHAR_LENGTH(TRIM(reason)) > 0 AND CHAR_LENGTH(TRIM(material_review_note)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TRIGGER trg_production_batch_termination_no_update BEFORE UPDATE ON production_batch_termination
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Production termination facts are immutable';
CREATE TRIGGER trg_production_batch_termination_no_delete BEFORE DELETE ON production_batch_termination
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Production termination facts are immutable';

ALTER TABLE production_batches DROP CHECK chk_production_batches_status,
  ADD CONSTRAINT chk_production_batches_status CHECK (status IN ('pending','material_pending','material_assigned','material_partially_outbound','material_outbound','doing','completed','cancelled','terminated'));
ALTER TABLE work_orders DROP CHECK chk_work_orders_close_type,
  ADD CONSTRAINT chk_work_orders_close_type CHECK (close_type IS NULL OR close_type IN ('unproduced','underproduced','completed_archive','production_terminated'));
ALTER TABLE batch_step_abnormal_dispositions
  DROP CHECK chk_batch_step_abnormal_dispositions_review_status,
  DROP CHECK chk_batch_step_abnormal_dispositions_state,
  ADD CONSTRAINT chk_batch_step_abnormal_dispositions_review_status CHECK (review_status IN ('pending_review','approved','rejected','cancelled','terminated')),
  ADD CONSTRAINT chk_batch_step_abnormal_dispositions_state CHECK (
    (review_status='pending_review' AND disposition_type IS NULL AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (review_status='approved' AND disposition_type IS NOT NULL AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
    OR (review_status IN ('rejected','cancelled','terminated') AND disposition_type IS NULL AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  );
ALTER TABLE production_material_supplement DROP CHECK chk_production_material_supplement_status,
  ADD CONSTRAINT chk_production_material_supplement_status CHECK (
    (status IN ('approved','cancelled') AND fulfilled_at IS NULL AND fulfilled_by IS NULL)
    OR (status='fulfilled' AND fulfilled_at IS NOT NULL AND fulfilled_by IS NOT NULL)
  );
ALTER TABLE outbound_order DROP CHECK chk_outbound_order_cancel_source,
  ADD CONSTRAINT chk_outbound_order_cancel_source CHECK (cancel_source IS NULL OR cancel_source IN ('manual','production_batch','production_termination'));
ALTER TABLE production_item_demand DROP CHECK chk_production_item_demand_cancel_facts,
  ADD CONSTRAINT chk_production_item_demand_cancel_facts CHECK (
    (business_status='cancelled' AND cancel_source IN ('production_batch','short_batch_remaining_close','production_termination')
      AND cancel_reason IS NOT NULL AND CHAR_LENGTH(TRIM(cancel_reason))>0 AND cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL)
    OR (business_status<>'cancelled' AND cancel_source IS NULL AND cancel_reason IS NULL AND cancelled_by IS NULL AND cancelled_at IS NULL)
  );

INSERT INTO permissions (parent_id,name,code,type,route_path,api_method,api_path,sort_order,status)
SELECT id,'结束批次并登记产出','production:tasks:terminate','api',NULL,'POST','/api/production/batches/:batchId/actions/terminate',90,1
FROM (SELECT id FROM permissions WHERE code='production:tasks:view') parent;
