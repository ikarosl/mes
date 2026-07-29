DELETE FROM permissions WHERE code IN (
  'production:orders:create','production:orders:update','production:orders:transition',
  'production:batches:create','production:batches:update','production:batches:transition','production:steps:report'
);
DROP TABLE batch_step_records;
DROP TABLE production_batches;
DROP TABLE work_orders;
