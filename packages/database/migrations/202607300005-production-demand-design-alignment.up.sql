ALTER TABLE work_orders
  ADD KEY idx_work_orders_external_order_no (external_order_no);

ALTER TABLE production_item_demand
  ADD KEY idx_production_item_demand_parent (parent_demand_id),
  ADD KEY idx_production_item_demand_source_scrap (source_scrap_id),
  ADD CONSTRAINT fk_production_item_demand_parent
    FOREIGN KEY (parent_demand_id) REFERENCES production_item_demand(id);

ALTER TABLE production_item_demand
  DROP CHECK chk_production_item_demand_type,
  DROP CHECK chk_production_item_demand_normal;

ALTER TABLE production_item_demand
  ADD CONSTRAINT chk_production_item_demand_type
    CHECK (demand_type IN (0, 1)),
  ADD CONSTRAINT chk_production_item_demand_source
    CHECK (
      (demand_type = 0 AND parent_demand_id IS NULL AND source_scrap_id IS NULL)
      OR
      (demand_type = 1 AND parent_demand_id IS NOT NULL AND source_scrap_id IS NULL)
    );
