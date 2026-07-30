ALTER TABLE production_batches
  ADD COLUMN plan_start_date DATE NULL AFTER qualified_quantity,
  ADD COLUMN plan_end_date DATE NULL AFTER plan_start_date,
  ADD KEY idx_production_batches_plan_start_date (plan_start_date),
  ADD CONSTRAINT chk_production_batches_plan_dates
    CHECK (plan_start_date IS NULL OR plan_end_date IS NULL OR plan_end_date >= plan_start_date);
