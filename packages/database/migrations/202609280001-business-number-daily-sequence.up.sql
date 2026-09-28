-- Stop all numbered business writers; reset development facts through the initialization workflow.
CREATE TEMPORARY TABLE guard_business_number_empty (ok TINYINT NOT NULL CHECK(ok=1));
INSERT INTO guard_business_number_empty SELECT IF(
  EXISTS(SELECT 1 FROM work_orders)
  OR EXISTS(SELECT 1 FROM production_batches)
  OR EXISTS(SELECT 1 FROM procurement_order)
  OR EXISTS(SELECT 1 FROM procurement_receipt)
  OR EXISTS(SELECT 1 FROM procurement_supplier_return)
  OR EXISTS(SELECT 1 FROM inbound_order)
  OR EXISTS(SELECT 1 FROM item_batch)
  OR EXISTS(SELECT 1 FROM stock_check_order)
  OR EXISTS(SELECT 1 FROM outbound_order)
  OR EXISTS(SELECT 1 FROM return_order)
  OR EXISTS(SELECT 1 FROM item_scrap)
  OR EXISTS(SELECT 1 FROM production_manual_demand_addition)
  OR EXISTS(SELECT 1 FROM rework_records)
  OR EXISTS(SELECT 1 FROM batch_step_reports)
  OR EXISTS(SELECT 1 FROM batch_step_abnormal_dispositions)
  OR EXISTS(SELECT 1 FROM production_scrap_supplement_plan)
  OR EXISTS(SELECT 1 FROM production_material_supplement)
  OR EXISTS(SELECT 1 FROM approval_instances)
  OR EXISTS(SELECT 1 FROM http_idempotency_records),0,1);
DROP TEMPORARY TABLE guard_business_number_empty;

CREATE TABLE business_number_daily_sequence (
  number_kind VARCHAR(64) NOT NULL COMMENT 'Stable business numbering kind',
  number_date DATE NOT NULL COMMENT 'Beijing calendar day from the database clock',
  last_sequence BIGINT UNSIGNED NOT NULL COMMENT 'Last allocated sequence; not recycled after commit',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (number_kind,number_date),
  CONSTRAINT chk_business_number_sequence_positive CHECK(last_sequence>0),
  CONSTRAINT chk_business_number_kind CHECK(number_kind IN(
    'work_order',
    'production_batch',
    'purchase_order',
    'purchase_receipt',
    'supplier_return',
    'purchase_inbound',
    'finished_inbound',
    'inventory_batch',
    'stock_check',
    'production_material_outbound',
    'production_material_return',
    'material_loss',
    'manual_material_demand',
    'rework',
    'step_report',
    'abnormal_disposition',
    'scrap_supplement_plan',
    'material_supplement',
    'approval_instance'
  ))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE item_batch ADD UNIQUE KEY uk_item_batch_code (batch_code);
DROP TABLE work_order_daily_sequence;
