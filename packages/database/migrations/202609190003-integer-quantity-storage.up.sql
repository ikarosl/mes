-- Existing DECIMAL columns already have integer CHECKs and an eight-digit range.
-- Preserve that business range explicitly when replacing the physical type.
-- Stop quantity writes and deploy matching integer-string response mappers together.

ALTER TABLE batch_step_reports
  MODIFY COLUMN reported_quantity INT NOT NULL,
  MODIFY COLUMN normal_quantity INT NOT NULL,
  MODIFY COLUMN abnormal_quantity INT NOT NULL,
  ADD CONSTRAINT chk_integer_storage_batch_step_reports CHECK (
    reported_quantity BETWEEN 0 AND 99999999 AND normal_quantity BETWEEN 0 AND 99999999 AND abnormal_quantity BETWEEN 0 AND 99999999
  );

ALTER TABLE batch_step_scrap_records
  MODIFY COLUMN scrap_quantity INT NOT NULL,
  ADD CONSTRAINT chk_integer_storage_batch_step_scrap_records CHECK (
    scrap_quantity BETWEEN 0 AND 99999999
  );

ALTER TABLE batch_step_scrap_reproduction_authorization
  MODIFY COLUMN authorized_quantity INT NOT NULL,
  ADD CONSTRAINT chk_integer_storage_batch_step_scrap_reproduction_authorization CHECK (
    authorized_quantity BETWEEN 0 AND 99999999
  );

ALTER TABLE inbound_detail
  MODIFY COLUMN inbound_number INT NOT NULL,
  ADD CONSTRAINT chk_integer_storage_inbound_detail CHECK (
    inbound_number BETWEEN 0 AND 99999999
  );

ALTER TABLE inventory_transaction
  MODIFY COLUMN quantity INT NOT NULL,
  ADD CONSTRAINT chk_integer_storage_inventory_transaction CHECK (
    quantity BETWEEN -99999999 AND 99999999
  );

ALTER TABLE item_scrap
  MODIFY COLUMN scrap_number INT NOT NULL,
  ADD CONSTRAINT chk_integer_storage_item_scrap CHECK (
    scrap_number BETWEEN 0 AND 99999999
  );

ALTER TABLE outbound_detail
  MODIFY COLUMN outbound_number INT NOT NULL,
  ADD CONSTRAINT chk_integer_storage_outbound_detail CHECK (
    outbound_number BETWEEN 0 AND 99999999
  );

ALTER TABLE product_materials
  MODIFY COLUMN quantity_per_unit INT NOT NULL,
  ADD CONSTRAINT chk_integer_storage_product_materials CHECK (
    quantity_per_unit BETWEEN 0 AND 99999999
  );

ALTER TABLE production_batches
  MODIFY COLUMN planned_quantity INT NOT NULL,
  ADD CONSTRAINT chk_integer_storage_production_batches CHECK (
    planned_quantity BETWEEN 0 AND 99999999
  );

ALTER TABLE production_item_allocation
  MODIFY COLUMN assigned_number INT NOT NULL,
  ADD CONSTRAINT chk_integer_storage_production_item_allocation CHECK (
    assigned_number BETWEEN 0 AND 99999999
  );

ALTER TABLE production_item_demand
  MODIFY COLUMN quantity_per_unit_snapshot INT NOT NULL,
  MODIFY COLUMN planned_output_quantity_snapshot INT NOT NULL,
  MODIFY COLUMN need_number INT NOT NULL,
  ADD CONSTRAINT chk_integer_storage_production_item_demand CHECK (
    quantity_per_unit_snapshot BETWEEN 0 AND 99999999 AND planned_output_quantity_snapshot BETWEEN 0 AND 99999999 AND need_number BETWEEN 0 AND 99999999
  );

ALTER TABLE production_material_requirement_basis
  MODIFY COLUMN quantity_per_unit_snapshot INT NOT NULL,
  MODIFY COLUMN planned_output_quantity_snapshot INT NOT NULL,
  MODIFY COLUMN required_number INT NOT NULL,
  ADD CONSTRAINT chk_integer_storage_production_material_requirement_basis CHECK (
    quantity_per_unit_snapshot BETWEEN 0 AND 99999999 AND planned_output_quantity_snapshot BETWEEN 0 AND 99999999 AND required_number BETWEEN 0 AND 99999999
  );

ALTER TABLE production_scrap_supplement_plan_line
  MODIFY COLUMN planned_quantity INT NOT NULL,
  ADD CONSTRAINT chk_integer_storage_production_scrap_supplement_plan_line CHECK (
    planned_quantity BETWEEN 0 AND 99999999
  );

ALTER TABLE return_detail
  MODIFY COLUMN return_number INT NOT NULL,
  ADD CONSTRAINT chk_integer_storage_return_detail CHECK (
    return_number BETWEEN 0 AND 99999999
  );

ALTER TABLE rework_records
  MODIFY COLUMN rework_quantity INT NOT NULL,
  ADD CONSTRAINT chk_integer_storage_rework_records CHECK (
    rework_quantity BETWEEN 0 AND 99999999
  );

ALTER TABLE stock_check_detail
  MODIFY COLUMN system_quantity INT NOT NULL,
  MODIFY COLUMN actual_quantity INT NULL,
  MODIFY COLUMN difference_quantity INT GENERATED ALWAYS AS (CASE WHEN actual_quantity IS NULL THEN NULL ELSE actual_quantity-system_quantity END) STORED,
  ADD CONSTRAINT chk_integer_storage_stock_check_detail CHECK (
    system_quantity BETWEEN 0 AND 99999999 AND actual_quantity BETWEEN 0 AND 99999999 AND difference_quantity BETWEEN -99999999 AND 99999999
  );

ALTER TABLE work_orders
  MODIFY COLUMN planned_quantity INT NOT NULL,
  ADD CONSTRAINT chk_integer_storage_work_orders CHECK (
    planned_quantity BETWEEN 0 AND 99999999
  );

