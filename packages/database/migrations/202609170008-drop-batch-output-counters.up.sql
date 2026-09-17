-- Pause Production writes and deploy the matching API together with this migration.
-- Report facts and approved output revisions retain their separate ownership;
-- production_batches no longer stores duplicated report or unused quality quantities.
ALTER TABLE production_batches
  DROP CHECK chk_production_batches_quantity,
  DROP CHECK chk_production_batches_quantities_integer,
  DROP COLUMN completed_quantity,
  DROP COLUMN qualified_quantity,
  ADD CONSTRAINT chk_production_batches_quantity CHECK (planned_quantity > 0),
  ADD CONSTRAINT chk_production_batches_quantities_integer
    CHECK (planned_quantity = TRUNCATE(planned_quantity, 0));
