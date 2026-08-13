DROP TABLE batch_step_abnormal_dispositions;

ALTER TABLE production_item_demand
  DROP CHECK chk_production_item_demand_source,
  DROP CHECK chk_production_item_demand_type;

UPDATE production_item_demand
SET demand_type = CASE demand_type
  WHEN 'normal' THEN '0'
  WHEN 'manual_additional' THEN '1'
END;

ALTER TABLE production_item_demand
  MODIFY COLUMN demand_type TINYINT NOT NULL DEFAULT 0,
  ADD CONSTRAINT chk_production_item_demand_type
    CHECK (demand_type IN (0, 1)),
  ADD CONSTRAINT chk_production_item_demand_source
    CHECK (
      (demand_type = 0 AND parent_demand_id IS NULL AND source_scrap_id IS NULL)
      OR
      (demand_type = 1 AND parent_demand_id IS NOT NULL AND source_scrap_id IS NULL)
    );

ALTER TABLE batch_step_records
  DROP CHECK chk_batch_step_records_status,
  ADD CONSTRAINT chk_batch_step_records_status
    CHECK (status IN ('pending', 'assigned', 'doing', 'completed', 'abnormal'));
