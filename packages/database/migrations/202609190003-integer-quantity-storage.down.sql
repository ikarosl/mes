-- Range checks guarantee that every value still fits the prior DECIMAL type.

ALTER TABLE batch_step_reports
  DROP CHECK chk_integer_storage_batch_step_reports,
  MODIFY COLUMN reported_quantity DECIMAL(12,4) NOT NULL,
  MODIFY COLUMN normal_quantity DECIMAL(12,4) NOT NULL,
  MODIFY COLUMN abnormal_quantity DECIMAL(12,4) NOT NULL;

ALTER TABLE batch_step_scrap_records
  DROP CHECK chk_integer_storage_batch_step_scrap_records,
  MODIFY COLUMN scrap_quantity DECIMAL(12,4) NOT NULL;

ALTER TABLE batch_step_scrap_reproduction_authorization
  DROP CHECK chk_integer_storage_batch_step_scrap_reproduction_authorization,
  MODIFY COLUMN authorized_quantity DECIMAL(12,4) NOT NULL;

ALTER TABLE inbound_detail
  DROP CHECK chk_integer_storage_inbound_detail,
  MODIFY COLUMN inbound_number DECIMAL(12,4) NOT NULL;

ALTER TABLE inventory_transaction
  DROP CHECK chk_integer_storage_inventory_transaction,
  MODIFY COLUMN quantity DECIMAL(12,4) NOT NULL;

ALTER TABLE item_scrap
  DROP CHECK chk_integer_storage_item_scrap,
  MODIFY COLUMN scrap_number DECIMAL(12,4) NOT NULL;

ALTER TABLE outbound_detail
  DROP CHECK chk_integer_storage_outbound_detail,
  MODIFY COLUMN outbound_number DECIMAL(12,4) NOT NULL;

ALTER TABLE product_materials
  DROP CHECK chk_integer_storage_product_materials,
  MODIFY COLUMN quantity_per_unit DECIMAL(12,4) NOT NULL;

ALTER TABLE production_batches
  DROP CHECK chk_integer_storage_production_batches,
  MODIFY COLUMN planned_quantity DECIMAL(12,4) NOT NULL;

ALTER TABLE production_item_allocation
  DROP CHECK chk_integer_storage_production_item_allocation,
  MODIFY COLUMN assigned_number DECIMAL(12,4) NOT NULL;

ALTER TABLE production_item_demand
  DROP CHECK chk_integer_storage_production_item_demand,
  MODIFY COLUMN quantity_per_unit_snapshot DECIMAL(12,4) NOT NULL,
  MODIFY COLUMN planned_output_quantity_snapshot DECIMAL(12,4) NOT NULL,
  MODIFY COLUMN need_number DECIMAL(12,4) NOT NULL;

ALTER TABLE production_material_requirement_basis
  DROP CHECK chk_integer_storage_production_material_requirement_basis,
  MODIFY COLUMN quantity_per_unit_snapshot DECIMAL(12,4) NOT NULL,
  MODIFY COLUMN planned_output_quantity_snapshot DECIMAL(12,4) NOT NULL,
  MODIFY COLUMN required_number DECIMAL(12,4) NOT NULL;

ALTER TABLE production_scrap_supplement_plan_line
  DROP CHECK chk_integer_storage_production_scrap_supplement_plan_line,
  MODIFY COLUMN planned_quantity DECIMAL(12,4) NOT NULL;

ALTER TABLE return_detail
  DROP CHECK chk_integer_storage_return_detail,
  MODIFY COLUMN return_number DECIMAL(12,4) NOT NULL;

ALTER TABLE rework_records
  DROP CHECK chk_integer_storage_rework_records,
  MODIFY COLUMN rework_quantity DECIMAL(12,4) NOT NULL;

ALTER TABLE stock_check_detail
  DROP CHECK chk_integer_storage_stock_check_detail,
  MODIFY COLUMN system_quantity DECIMAL(12,4) NOT NULL,
  MODIFY COLUMN actual_quantity DECIMAL(12,4) NULL,
  MODIFY COLUMN difference_quantity DECIMAL(12,4) GENERATED ALWAYS AS (CASE WHEN actual_quantity IS NULL THEN NULL ELSE actual_quantity-system_quantity END) STORED;

ALTER TABLE work_orders
  DROP CHECK chk_integer_storage_work_orders,
  MODIFY COLUMN planned_quantity DECIMAL(12,4) NOT NULL;

