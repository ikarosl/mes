ALTER TABLE work_orders
  ADD COLUMN cancel_reason TEXT NULL AFTER released_at,
  ADD COLUMN cancelled_by BIGINT UNSIGNED NULL AFTER cancel_reason,
  ADD COLUMN cancelled_at DATETIME NULL AFTER cancelled_by,
  ADD COLUMN close_type VARCHAR(30) NULL AFTER cancelled_at,
  ADD COLUMN close_reason TEXT NULL AFTER close_type,
  ADD COLUMN closed_by BIGINT UNSIGNED NULL AFTER close_reason,
  ADD COLUMN closed_at DATETIME NULL AFTER closed_by,
  ADD KEY idx_work_orders_cancelled_by (cancelled_by),
  ADD KEY idx_work_orders_closed_by (closed_by),
  ADD CONSTRAINT chk_work_orders_close_type
    CHECK (close_type IS NULL OR close_type IN ('unproduced', 'underproduced', 'completed_archive')),
  ADD CONSTRAINT fk_work_orders_cancelled_by
    FOREIGN KEY (cancelled_by) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_work_orders_closed_by
    FOREIGN KEY (closed_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE production_batches
  ADD COLUMN cancel_reason TEXT NULL AFTER completed_by,
  ADD COLUMN cancelled_by BIGINT UNSIGNED NULL AFTER cancel_reason,
  ADD COLUMN cancelled_at DATETIME NULL AFTER cancelled_by,
  ADD KEY idx_production_batches_cancelled_by (cancelled_by),
  ADD CONSTRAINT fk_production_batches_cancelled_by
    FOREIGN KEY (cancelled_by) REFERENCES users(id) ON DELETE SET NULL;

UPDATE work_orders wo
JOIN (
  SELECT target_id, MAX(id) AS log_id
  FROM operation_logs
  WHERE module = 'production'
    AND action = 'work-order.cancel'
    AND target_type = 'work_order'
    AND result = 'success'
  GROUP BY target_id
) latest ON latest.target_id = wo.id
JOIN operation_logs ol ON ol.id = latest.log_id
SET wo.cancel_reason = NULLIF(NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(ol.after_data, '$.reason'))), ''), 'null'),
    wo.cancelled_by = ol.user_id,
    wo.cancelled_at = ol.created_at
WHERE wo.status = 'cancelled';

UPDATE work_orders wo
JOIN (
  SELECT target_id, MAX(id) AS log_id
  FROM operation_logs
  WHERE module = 'production'
    AND action = 'work-order.close'
    AND target_type = 'work_order'
    AND result = 'success'
  GROUP BY target_id
) latest ON latest.target_id = wo.id
JOIN operation_logs ol ON ol.id = latest.log_id
SET wo.close_type = NULLIF(NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(ol.after_data, '$.closeType'))), ''), 'null'),
    wo.close_reason = NULLIF(NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(ol.after_data, '$.reason'))), ''), 'null'),
    wo.closed_by = ol.user_id,
    wo.closed_at = ol.created_at
WHERE wo.status = 'closed';

UPDATE production_batches batch
JOIN (
  SELECT target_id, MAX(id) AS log_id
  FROM operation_logs
  WHERE module = 'production'
    AND action = 'production-batch.cancel'
    AND target_type = 'production_batch'
    AND result = 'success'
  GROUP BY target_id
) latest ON latest.target_id = batch.id
JOIN operation_logs ol ON ol.id = latest.log_id
SET batch.cancel_reason = NULLIF(NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(ol.after_data, '$.reason'))), ''), 'null'),
    batch.cancelled_by = ol.user_id,
    batch.cancelled_at = ol.created_at
WHERE batch.status = 'cancelled';
