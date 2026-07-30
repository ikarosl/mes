DELETE FROM permissions WHERE code IN (
  'production:orders:view','production:orders:create','production:orders:update',
  'production:orders:transition','production:tasks:view','production:batches:create',
  'production:batches:update','production:batches:transition','production:steps:report'
);
DELETE FROM permissions WHERE code = 'production:view';
DROP TABLE batch_step_records;
DROP TABLE production_batches;
DROP TABLE work_orders;
