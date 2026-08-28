DELETE FROM role_permissions WHERE permission_id IN (
  SELECT id FROM permissions WHERE code IN ('production:materials:authorize-short-batch','production:materials:close-remaining-demands')
);
DELETE FROM permissions WHERE code IN ('production:materials:authorize-short-batch','production:materials:close-remaining-demands');

ALTER TABLE production_item_demand
  DROP FOREIGN KEY fk_production_item_demand_cancelled_by,
  DROP CHECK chk_production_item_demand_cancel_facts,
  DROP KEY idx_production_item_demand_cancelled_by,
  DROP COLUMN cancelled_at,
  DROP COLUMN cancelled_by,
  DROP COLUMN cancel_reason,
  DROP COLUMN cancel_source;

ALTER TABLE outbound_order
  DROP FOREIGN KEY fk_outbound_order_short_batch_authorization,
  DROP KEY idx_outbound_order_short_batch_authorization,
  DROP COLUMN short_batch_authorization_id;

DROP TABLE production_short_batch_authorization_detail;
DROP TABLE production_short_batch_authorization;

UPDATE production_batches
SET status='material_pending'
WHERE status='material_partially_outbound';

ALTER TABLE production_batches
  DROP CHECK chk_production_batches_status,
  DROP CHECK chk_production_batches_material_plan_version,
  DROP COLUMN material_plan_version,
  ADD CONSTRAINT chk_production_batches_status CHECK (status IN ('pending', 'material_pending', 'material_assigned', 'material_outbound', 'doing', 'completed', 'cancelled'));
