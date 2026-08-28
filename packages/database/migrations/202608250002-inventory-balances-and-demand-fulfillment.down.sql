DROP TRIGGER IF EXISTS trg_item_batch_move_item_balance;
DROP TRIGGER IF EXISTS trg_inventory_transaction_cleanup_balances;
DROP TRIGGER IF EXISTS trg_inventory_transaction_update_balances;
DROP TRIGGER IF EXISTS trg_inventory_item_balance_reject_negative_update;
DROP TRIGGER IF EXISTS trg_inventory_item_balance_reject_negative_insert;
DROP TRIGGER IF EXISTS trg_inventory_batch_balance_reject_negative_update;
DROP TRIGGER IF EXISTS trg_inventory_batch_balance_reject_negative_insert;

DROP TABLE inventory_item_balance;
DROP TABLE inventory_batch_balance;

ALTER TABLE production_item_demand
  DROP FOREIGN KEY fk_production_item_demand_fulfilled_by,
  DROP CHECK chk_production_item_demand_terminal,
  DROP CHECK chk_production_item_demand_remaining,
  DROP CHECK chk_production_item_demand_status,
  DROP INDEX idx_production_item_demand_status_item,
  DROP COLUMN fulfilled_at,
  DROP COLUMN fulfilled_by,
  DROP COLUMN remaining_number,
  DROP COLUMN item_name_snapshot,
  DROP COLUMN item_code_snapshot,
  ADD CONSTRAINT chk_production_item_demand_status CHECK (
    business_status IN ('active','cancelled')
  );
