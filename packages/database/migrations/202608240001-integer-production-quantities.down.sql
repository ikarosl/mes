ALTER TABLE production_scrap_supplement_plan_line
  DROP CHECK chk_scrap_supplement_plan_line_quantity_integer;

ALTER TABLE stock_check_detail
  DROP CHECK chk_stock_check_detail_quantities_integer;

ALTER TABLE item_scrap
  DROP CHECK chk_item_scrap_quantity_integer;

ALTER TABLE return_detail
  DROP CHECK chk_return_detail_quantity_integer;

ALTER TABLE batch_step_scrap_reproduction_authorization
  DROP CHECK chk_scrap_reproduction_authorization_quantity_integer;

ALTER TABLE batch_step_scrap_records
  DROP CHECK chk_batch_step_scrap_records_quantity_integer;

ALTER TABLE rework_records
  DROP CHECK chk_rework_records_quantity_integer;

ALTER TABLE inbound_detail
  DROP CHECK chk_inbound_detail_quantity_integer;

ALTER TABLE inventory_transaction
  DROP CHECK chk_inventory_transaction_quantity_integer;

ALTER TABLE outbound_detail
  DROP CHECK chk_outbound_detail_quantity_integer;

ALTER TABLE production_item_allocation
  DROP CHECK chk_production_item_allocation_quantity_integer;

ALTER TABLE batch_step_reports
  DROP CHECK chk_batch_step_reports_quantities_integer;

ALTER TABLE production_item_demand
  DROP CHECK chk_production_item_demand_quantities_integer;

ALTER TABLE production_batches
  DROP CHECK chk_production_batches_quantities_integer;

ALTER TABLE work_orders
  DROP CHECK chk_work_orders_quantity_integer;

ALTER TABLE product_materials
  DROP CHECK chk_product_materials_quantity_integer;
