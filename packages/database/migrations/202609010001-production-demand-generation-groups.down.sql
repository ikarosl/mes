ALTER TABLE production_item_demand
  DROP CHECK chk_production_item_demand_generation_group_key,
  DROP KEY idx_production_item_demand_generation_group,
  DROP COLUMN generation_group_key;
