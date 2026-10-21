CREATE TEMPORARY TABLE tmp_production_termination_down_guard (invalid_value INT NOT NULL CHECK (invalid_value=0));
INSERT INTO tmp_production_termination_down_guard
SELECT 1 WHERE EXISTS (SELECT 1 FROM production_batch_termination)
  OR EXISTS (SELECT 1 FROM production_batches WHERE status='terminated')
  OR EXISTS (SELECT 1 FROM work_orders WHERE close_type='production_terminated')
  OR EXISTS (SELECT 1 FROM batch_step_abnormal_dispositions WHERE review_status='terminated')
  OR EXISTS (SELECT 1 FROM production_material_supplement WHERE status='cancelled')
  OR EXISTS (SELECT 1 FROM production_item_demand WHERE cancel_source='production_termination')
  OR EXISTS (SELECT 1 FROM outbound_order WHERE cancel_source='production_termination');
DROP TEMPORARY TABLE tmp_production_termination_down_guard;

DELETE rp FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE p.code='production:tasks:terminate';
DELETE FROM permissions WHERE code='production:tasks:terminate';
ALTER TABLE production_batches DROP CHECK chk_production_batches_status,
  ADD CONSTRAINT chk_production_batches_status CHECK (status IN ('pending','material_pending','material_assigned','material_partially_outbound','material_outbound','doing','completed','cancelled'));
ALTER TABLE work_orders DROP CHECK chk_work_orders_close_type,
  ADD CONSTRAINT chk_work_orders_close_type CHECK (close_type IS NULL OR close_type IN ('unproduced','underproduced','completed_archive'));
ALTER TABLE batch_step_abnormal_dispositions
  DROP CHECK chk_batch_step_abnormal_dispositions_review_status,
  DROP CHECK chk_batch_step_abnormal_dispositions_state,
  ADD CONSTRAINT chk_batch_step_abnormal_dispositions_review_status CHECK (review_status IN ('pending_review','approved','rejected','cancelled')),
  ADD CONSTRAINT chk_batch_step_abnormal_dispositions_state CHECK (
    (review_status='pending_review' AND disposition_type IS NULL AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (review_status='approved' AND disposition_type IS NOT NULL AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
    OR (review_status IN ('rejected','cancelled') AND disposition_type IS NULL AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  );
ALTER TABLE production_material_supplement DROP CHECK chk_production_material_supplement_status,
  ADD CONSTRAINT chk_production_material_supplement_status CHECK (
    (status='approved' AND fulfilled_at IS NULL AND fulfilled_by IS NULL)
    OR (status='fulfilled' AND fulfilled_at IS NOT NULL AND fulfilled_by IS NOT NULL)
  );
ALTER TABLE outbound_order DROP CHECK chk_outbound_order_cancel_source,
  ADD CONSTRAINT chk_outbound_order_cancel_source CHECK (cancel_source IS NULL OR cancel_source IN ('manual','production_batch'));
ALTER TABLE production_item_demand DROP CHECK chk_production_item_demand_cancel_facts,
  ADD CONSTRAINT chk_production_item_demand_cancel_facts CHECK (
    (business_status='cancelled' AND cancel_source IN ('production_batch','short_batch_remaining_close')
      AND cancel_reason IS NOT NULL AND CHAR_LENGTH(TRIM(cancel_reason))>0 AND cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL)
    OR (business_status<>'cancelled' AND cancel_source IS NULL AND cancel_reason IS NULL AND cancelled_by IS NULL AND cancelled_at IS NULL)
  );
DROP TRIGGER trg_production_batch_termination_no_update;
DROP TRIGGER trg_production_batch_termination_no_delete;
DROP TABLE production_batch_termination;
