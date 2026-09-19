CREATE TEMPORARY TABLE tmp_purchase_order_down_guard (invalid_value TINYINT NOT NULL CHECK(invalid_value=0)) ENGINE=MEMORY;
INSERT INTO tmp_purchase_order_down_guard SELECT 1 WHERE EXISTS(SELECT 1 FROM purchase_order);
DROP TEMPORARY TABLE tmp_purchase_order_down_guard;
DROP TRIGGER trg_purchase_order_closure_no_delete;
DROP TRIGGER trg_purchase_order_closure_no_update;
DROP TABLE purchase_order_line_closure;
DROP TABLE purchase_order_line_source;
DROP TABLE purchase_order_line;
DROP TABLE purchase_order;
DELETE FROM role_permissions WHERE permission_id IN (
  SELECT id FROM permissions WHERE code IN ('procurement:orders:view','procurement:orders:create','procurement:orders:update','procurement:orders:place','procurement:orders:cancel','procurement:orders:close')
);
DELETE FROM permissions WHERE code IN ('procurement:orders:create','procurement:orders:update','procurement:orders:place','procurement:orders:cancel','procurement:orders:close');
DELETE FROM permissions WHERE code='procurement:orders:view';

