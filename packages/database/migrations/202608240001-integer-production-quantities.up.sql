-- Current MES quantity semantics are integer-only. Keep DECIMAL(12,4) as the exact legacy
-- representation (`12.0000`) but reject every fractional value at the database boundary.
-- Adding these checks also makes the migration fail visibly if historical fractional data exists;
-- it must be reviewed and corrected explicitly instead of being rounded silently.

ALTER TABLE product_materials
  ADD CONSTRAINT chk_product_materials_quantity_integer
    CHECK (quantity_per_unit = TRUNCATE(quantity_per_unit, 0));

ALTER TABLE work_orders
  ADD CONSTRAINT chk_work_orders_quantity_integer
    CHECK (planned_quantity = TRUNCATE(planned_quantity, 0));

ALTER TABLE production_batches
  ADD CONSTRAINT chk_production_batches_quantities_integer CHECK (
    planned_quantity = TRUNCATE(planned_quantity, 0)
    AND completed_quantity = TRUNCATE(completed_quantity, 0)
    AND qualified_quantity = TRUNCATE(qualified_quantity, 0)
  );

ALTER TABLE production_item_demand
  ADD CONSTRAINT chk_production_item_demand_quantities_integer CHECK (
    quantity_per_unit_snapshot = TRUNCATE(quantity_per_unit_snapshot, 0)
    AND planned_output_quantity_snapshot = TRUNCATE(planned_output_quantity_snapshot, 0)
    AND need_number = TRUNCATE(need_number, 0)
  );

ALTER TABLE batch_step_reports
  ADD CONSTRAINT chk_batch_step_reports_quantities_integer CHECK (
    reported_quantity = TRUNCATE(reported_quantity, 0)
    AND normal_quantity = TRUNCATE(normal_quantity, 0)
    AND abnormal_quantity = TRUNCATE(abnormal_quantity, 0)
  );

ALTER TABLE production_item_allocation
  ADD CONSTRAINT chk_production_item_allocation_quantity_integer
    CHECK (assigned_number = TRUNCATE(assigned_number, 0));

ALTER TABLE outbound_detail
  ADD CONSTRAINT chk_outbound_detail_quantity_integer
    CHECK (outbound_number = TRUNCATE(outbound_number, 0));

ALTER TABLE inventory_transaction
  ADD CONSTRAINT chk_inventory_transaction_quantity_integer
    CHECK (quantity = TRUNCATE(quantity, 0));

ALTER TABLE inbound_detail
  ADD CONSTRAINT chk_inbound_detail_quantity_integer
    CHECK (inbound_number = TRUNCATE(inbound_number, 0));

ALTER TABLE rework_records
  ADD CONSTRAINT chk_rework_records_quantity_integer
    CHECK (rework_quantity = TRUNCATE(rework_quantity, 0));

ALTER TABLE batch_step_scrap_records
  ADD CONSTRAINT chk_batch_step_scrap_records_quantity_integer
    CHECK (scrap_quantity = TRUNCATE(scrap_quantity, 0));

ALTER TABLE batch_step_scrap_reproduction_authorization
  ADD CONSTRAINT chk_scrap_reproduction_authorization_quantity_integer
    CHECK (authorized_quantity = TRUNCATE(authorized_quantity, 0));

ALTER TABLE return_detail
  ADD CONSTRAINT chk_return_detail_quantity_integer
    CHECK (return_number = TRUNCATE(return_number, 0));

ALTER TABLE item_scrap
  ADD CONSTRAINT chk_item_scrap_quantity_integer
    CHECK (scrap_number = TRUNCATE(scrap_number, 0));

ALTER TABLE stock_check_detail
  ADD CONSTRAINT chk_stock_check_detail_quantities_integer CHECK (
    system_quantity = TRUNCATE(system_quantity, 0)
    AND (actual_quantity IS NULL OR actual_quantity = TRUNCATE(actual_quantity, 0))
  );

ALTER TABLE production_scrap_supplement_plan_line
  ADD CONSTRAINT chk_scrap_supplement_plan_line_quantity_integer
    CHECK (planned_quantity = TRUNCATE(planned_quantity, 0));
