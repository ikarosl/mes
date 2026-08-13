DELETE FROM role_permissions WHERE permission_id IN (
  SELECT id FROM permissions WHERE code IN ('production:materials:view','production:materials:allocate','production:materials:outbound')
);
DELETE FROM permissions WHERE code IN ('production:materials:view','production:materials:allocate','production:materials:outbound');
DROP TABLE inventory_transaction;
DROP TABLE outbound_detail;
DROP TABLE outbound_order;
DROP TABLE production_item_allocation;
DROP TABLE item_batch;
