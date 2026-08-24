ALTER TABLE production_item_demand
  DROP CHECK chk_production_item_demand_type,
  ADD CONSTRAINT chk_production_item_demand_type CHECK (
    demand_type IN (
      'normal',
      'manual_additional',
      'scrap_supplement',
      'material_loss_supplement'
    )
  );
