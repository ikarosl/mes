ALTER TABLE production_batches
  DROP CHECK chk_production_batches_plan_dates,
  DROP INDEX idx_production_batches_plan_start_date,
  DROP COLUMN plan_end_date,
  DROP COLUMN plan_start_date;
