ALTER TABLE item_scrap
  DROP FOREIGN KEY fk_item_scrap_cancelled_by,
  DROP INDEX idx_item_scrap_cancelled_by,
  DROP COLUMN cancelled_at,
  DROP COLUMN cancelled_by,
  DROP COLUMN cancel_reason;

ALTER TABLE stock_check_order
  DROP FOREIGN KEY fk_stock_check_order_cancelled_by,
  DROP INDEX idx_stock_check_order_cancelled_by,
  DROP COLUMN cancelled_at,
  DROP COLUMN cancelled_by,
  DROP COLUMN cancel_reason;

ALTER TABLE return_order
  DROP FOREIGN KEY fk_return_order_cancelled_by,
  DROP INDEX idx_return_order_cancelled_by,
  DROP COLUMN cancelled_at,
  DROP COLUMN cancelled_by,
  DROP COLUMN cancel_reason;

ALTER TABLE outbound_order
  DROP FOREIGN KEY fk_outbound_order_cancelled_by,
  DROP CHECK chk_outbound_order_cancel_source,
  DROP INDEX idx_outbound_order_cancelled_by,
  DROP COLUMN cancelled_at,
  DROP COLUMN cancelled_by,
  DROP COLUMN cancel_reason,
  DROP COLUMN cancel_source;

ALTER TABLE inbound_order
  DROP FOREIGN KEY fk_inbound_order_cancelled_by,
  DROP INDEX idx_inbound_order_cancelled_by,
  DROP COLUMN cancelled_at,
  DROP COLUMN cancelled_by,
  DROP COLUMN cancel_reason;
