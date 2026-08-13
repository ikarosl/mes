DELETE FROM permissions WHERE code IN (
  'warehouse:returns:create',
  'warehouse:returns:confirm',
  'warehouse:returns:cancel',
  'warehouse:stock-checks:create',
  'warehouse:stock-checks:count',
  'warehouse:stock-checks:complete',
  'warehouse:stock-checks:cancel'
);
DELETE FROM permissions WHERE code IN ('warehouse:returns:view','warehouse:stock-checks:view');
DELETE FROM permissions WHERE code='warehouse:view';

DROP TABLE stock_check_detail;
DROP TABLE stock_check_order;
DROP TABLE return_detail;
DROP TABLE return_order;
