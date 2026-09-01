ALTER TABLE production_item_demand
  ADD COLUMN generation_group_key VARCHAR(150) NULL AFTER demand_type;

UPDATE production_item_demand
SET generation_group_key = LEFT(
  idempotency_key,
  CHAR_LENGTH(idempotency_key) - LOCATE(':', REVERSE(idempotency_key))
);

ALTER TABLE production_item_demand
  MODIFY COLUMN generation_group_key VARCHAR(150) NOT NULL,
  ADD KEY idx_production_item_demand_generation_group (production_batch_id, generation_group_key, id),
  ADD CONSTRAINT chk_production_item_demand_generation_group_key CHECK (
    idempotency_key LIKE CONCAT(generation_group_key, ':%')
    AND (
      (demand_type='normal' AND generation_group_key LIKE 'NORMAL:%')
      OR (demand_type='manual_additional' AND generation_group_key LIKE 'ADDITIONAL:%')
      OR (demand_type='scrap_supplement' AND generation_group_key LIKE 'SCRAPSUP:%')
      OR (demand_type='material_loss_supplement' AND generation_group_key LIKE 'LOSSSUP:%')
    )
  );
