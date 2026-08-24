ALTER TABLE inbound_order
  ADD COLUMN cancel_reason TEXT NULL AFTER remark,
  ADD COLUMN cancelled_by BIGINT UNSIGNED NULL AFTER cancel_reason,
  ADD COLUMN cancelled_at DATETIME NULL AFTER cancelled_by,
  ADD KEY idx_inbound_order_cancelled_by (cancelled_by),
  ADD CONSTRAINT fk_inbound_order_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users(id);

ALTER TABLE outbound_order
  ADD COLUMN cancel_source VARCHAR(30) NULL AFTER remark,
  ADD COLUMN cancel_reason TEXT NULL AFTER cancel_source,
  ADD COLUMN cancelled_by BIGINT UNSIGNED NULL AFTER cancel_reason,
  ADD COLUMN cancelled_at DATETIME NULL AFTER cancelled_by,
  ADD KEY idx_outbound_order_cancelled_by (cancelled_by),
  ADD CONSTRAINT chk_outbound_order_cancel_source CHECK (
    cancel_source IS NULL OR cancel_source IN ('manual','production_batch')
  ),
  ADD CONSTRAINT fk_outbound_order_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users(id);

ALTER TABLE return_order
  ADD COLUMN cancel_reason TEXT NULL AFTER remark,
  ADD COLUMN cancelled_by BIGINT UNSIGNED NULL AFTER cancel_reason,
  ADD COLUMN cancelled_at DATETIME NULL AFTER cancelled_by,
  ADD KEY idx_return_order_cancelled_by (cancelled_by),
  ADD CONSTRAINT fk_return_order_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users(id);

ALTER TABLE stock_check_order
  ADD COLUMN cancel_reason TEXT NULL AFTER remark,
  ADD COLUMN cancelled_by BIGINT UNSIGNED NULL AFTER cancel_reason,
  ADD COLUMN cancelled_at DATETIME NULL AFTER cancelled_by,
  ADD KEY idx_stock_check_order_cancelled_by (cancelled_by),
  ADD CONSTRAINT fk_stock_check_order_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users(id);

ALTER TABLE item_scrap
  ADD COLUMN cancel_reason TEXT NULL AFTER remark,
  ADD COLUMN cancelled_by BIGINT UNSIGNED NULL AFTER cancel_reason,
  ADD COLUMN cancelled_at DATETIME NULL AFTER cancelled_by,
  ADD KEY idx_item_scrap_cancelled_by (cancelled_by),
  ADD CONSTRAINT fk_item_scrap_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users(id);

-- Historical cancellation commands did not consistently accept a reason, so only recover the
-- actor and timestamp from the latest successful audit fact. Leave unknown reasons as NULL.
UPDATE inbound_order target
JOIN (
  SELECT target_id, MAX(id) AS log_id FROM operation_logs
  WHERE module = 'production' AND action = 'production-inbound.cancel'
    AND target_type = 'inbound_order' AND result = 'success' GROUP BY target_id
) latest ON latest.target_id = target.id
JOIN operation_logs ol ON ol.id = latest.log_id
SET target.cancelled_by = ol.user_id, target.cancelled_at = ol.created_at
WHERE target.status = 'cancelled';

UPDATE outbound_order target
JOIN (
  SELECT target_id, MAX(id) AS log_id FROM operation_logs
  WHERE module = 'production' AND action = 'production-material.outbound.cancel'
    AND target_type = 'outbound_order' AND result = 'success' GROUP BY target_id
) latest ON latest.target_id = target.id
JOIN operation_logs ol ON ol.id = latest.log_id
SET target.cancel_source = 'manual', target.cancelled_by = ol.user_id,
    target.cancelled_at = ol.created_at
WHERE target.status = 'cancelled';

UPDATE outbound_order cascade_target
JOIN operation_logs ol
  ON ol.module = 'production'
  AND ol.action = 'production-batch.cancel'
  AND ol.target_type = 'production_batch'
  AND ol.result = 'success'
  AND JSON_CONTAINS(
    COALESCE(JSON_EXTRACT(ol.after_data, '$.cancelledPendingOutboundIds'), JSON_ARRAY()),
    JSON_QUOTE(CAST(cascade_target.id AS CHAR))
  )
SET cascade_target.cancel_source = 'production_batch',
    cascade_target.cancelled_by = ol.user_id,
    cascade_target.cancelled_at = ol.created_at
WHERE cascade_target.status = 'cancelled'
  AND cascade_target.cancel_source IS NULL;

UPDATE return_order target
JOIN (
  SELECT target_id, MAX(id) AS log_id FROM operation_logs
  WHERE module = 'production' AND action = 'production-return.cancel'
    AND target_type = 'return_order' AND result = 'success' GROUP BY target_id
) latest ON latest.target_id = target.id
JOIN operation_logs ol ON ol.id = latest.log_id
SET target.cancelled_by = ol.user_id, target.cancelled_at = ol.created_at
WHERE target.status = 'cancelled';

UPDATE stock_check_order target
JOIN (
  SELECT target_id, MAX(id) AS log_id FROM operation_logs
  WHERE module = 'production' AND action = 'production-stock-check.cancel'
    AND target_type = 'stock_check_order' AND result = 'success' GROUP BY target_id
) latest ON latest.target_id = target.id
JOIN operation_logs ol ON ol.id = latest.log_id
SET target.cancelled_by = ol.user_id, target.cancelled_at = ol.created_at
WHERE target.status = 'cancelled';

UPDATE item_scrap target
JOIN (
  SELECT target_id, MAX(id) AS log_id FROM operation_logs
  WHERE module = 'production' AND action = 'production-material-loss.cancel'
    AND target_type = 'item_scrap' AND result = 'success' GROUP BY target_id
) latest ON latest.target_id = target.id
JOIN operation_logs ol ON ol.id = latest.log_id
SET target.cancelled_by = ol.user_id, target.cancelled_at = ol.created_at
WHERE target.status = 'cancelled';
