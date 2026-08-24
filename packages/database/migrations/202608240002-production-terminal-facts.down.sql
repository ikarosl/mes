ALTER TABLE production_batches
  DROP FOREIGN KEY fk_production_batches_cancelled_by,
  DROP INDEX idx_production_batches_cancelled_by,
  DROP COLUMN cancelled_at,
  DROP COLUMN cancelled_by,
  DROP COLUMN cancel_reason;

ALTER TABLE work_orders
  DROP FOREIGN KEY fk_work_orders_closed_by,
  DROP FOREIGN KEY fk_work_orders_cancelled_by,
  DROP CHECK chk_work_orders_close_type,
  DROP INDEX idx_work_orders_closed_by,
  DROP INDEX idx_work_orders_cancelled_by,
  DROP COLUMN closed_at,
  DROP COLUMN closed_by,
  DROP COLUMN close_reason,
  DROP COLUMN close_type,
  DROP COLUMN cancelled_at,
  DROP COLUMN cancelled_by,
  DROP COLUMN cancel_reason;
