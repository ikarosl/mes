ALTER TABLE production_item_demand
  DROP CHECK chk_production_item_demand_source,
  DROP CHECK chk_production_item_demand_type;

ALTER TABLE production_item_demand
  DROP FOREIGN KEY fk_production_item_demand_parent,
  DROP INDEX idx_production_item_demand_source_scrap,
  DROP INDEX idx_production_item_demand_parent;

ALTER TABLE production_item_demand
  ADD CONSTRAINT chk_production_item_demand_type CHECK (demand_type = 0),
  ADD CONSTRAINT chk_production_item_demand_normal
    CHECK (parent_demand_id IS NULL AND source_scrap_id IS NULL);

ALTER TABLE work_orders
  DROP INDEX idx_work_orders_external_order_no;
