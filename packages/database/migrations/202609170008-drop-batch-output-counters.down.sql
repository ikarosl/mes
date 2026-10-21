-- Pause Production writes for the entire rollback and switch to the matching old API.
-- Only restore the old execution-completion counter from immutable report facts.
-- The unused qualified_quantity remains its old default 0: reports and approved
-- output must never be converted into fabricated quality-inspection facts.
ALTER TABLE production_batches
  ADD COLUMN completed_quantity DECIMAL(12,4) NOT NULL DEFAULT 0 AFTER planned_quantity,
  ADD COLUMN qualified_quantity DECIMAL(12,4) NOT NULL DEFAULT 0 AFTER completed_quantity;

UPDATE production_batches b
SET b.completed_quantity = COALESCE((
  SELECT SUM(CASE WHEN report.report_type='normal'
    THEN report.normal_quantity ELSE -report.normal_quantity END)
  FROM batch_step_reports report
  WHERE report.batch_step_record_id=(
    SELECT step.id FROM batch_step_records step WHERE step.production_batch_id=b.id
    ORDER BY step.step_order_snapshot DESC,step.id DESC LIMIT 1
  )
),0),
    b.updated_at = b.updated_at
WHERE b.execution_completed_at IS NOT NULL;

ALTER TABLE production_batches
  DROP CHECK chk_production_batches_quantity,
  DROP CHECK chk_production_batches_quantities_integer,
  ADD CONSTRAINT chk_production_batches_quantity CHECK (
    planned_quantity > 0 AND completed_quantity >= 0
    AND qualified_quantity >= 0 AND qualified_quantity <= completed_quantity
  ),
  ADD CONSTRAINT chk_production_batches_quantities_integer CHECK (
    planned_quantity = TRUNCATE(planned_quantity, 0)
    AND completed_quantity = TRUNCATE(completed_quantity, 0)
    AND qualified_quantity = TRUNCATE(qualified_quantity, 0)
  );
