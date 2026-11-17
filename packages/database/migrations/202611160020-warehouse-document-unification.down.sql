-- Empty-inventory rollback only. Never remove a committed unified number or manual closure decision.
CREATE TEMPORARY TABLE tmp_warehouse_document_unification_down_guard (
  invalid_data TINYINT NOT NULL,
  CONSTRAINT chk_warehouse_document_unification_down_empty CHECK (invalid_data=0)
) ENGINE=MEMORY;
INSERT INTO tmp_warehouse_document_unification_down_guard(invalid_data)
SELECT 1 WHERE EXISTS(SELECT 1 FROM inbound_order)
  OR EXISTS(SELECT 1 FROM inbound_detail)
  OR EXISTS(SELECT 1 FROM outbound_order)
  OR EXISTS(SELECT 1 FROM outbound_detail)
  OR EXISTS(SELECT 1 FROM inventory_transaction)
  OR EXISTS(SELECT 1 FROM procurement_receipt_line WHERE inbound_closed<>0)
  OR EXISTS(SELECT 1 FROM business_number_daily_sequence WHERE number_kind IN ('inbound_order','outbound_order'));
DROP TEMPORARY TABLE tmp_warehouse_document_unification_down_guard;

DROP TRIGGER trg_inventory_transaction_order_guard;
DROP TRIGGER trg_outbound_detail_item_kind_update;
DROP TRIGGER trg_outbound_detail_item_kind_insert;
DROP TRIGGER trg_inbound_detail_item_kind_update;
DROP TRIGGER trg_inbound_detail_item_kind_insert;
DROP TRIGGER trg_outbound_order_item_kind_guard;
DROP TRIGGER trg_inbound_order_item_kind_guard;
ALTER TABLE inventory_transaction
  DROP CHECK chk_inventory_transaction_order_reference,
  DROP INDEX idx_inventory_transaction_order,
  DROP COLUMN reference_order_no_snapshot,
  DROP COLUMN reference_order_id;
ALTER TABLE outbound_order
  DROP CHECK chk_outbound_order_source_item_kind,
  DROP CHECK chk_outbound_order_item_kind,
  DROP INDEX idx_outbound_order_kind_created,
  DROP COLUMN item_kind;
ALTER TABLE inbound_order
  DROP CHECK chk_inbound_order_source_item_kind,
  DROP CHECK chk_inbound_order_item_kind,
  DROP INDEX idx_inbound_order_kind_created,
  DROP COLUMN item_kind;
ALTER TABLE procurement_receipt_line
  DROP CHECK chk_procurement_receipt_line_inbound_closed,
  DROP COLUMN inbound_closed;
ALTER TABLE business_number_daily_sequence
  DROP CHECK chk_business_number_kind,
  ADD CONSTRAINT chk_business_number_kind CHECK (number_kind IN (
    'production_tracking_card','work_order','production_batch','purchase_order','purchase_receipt',
    'incoming_inspection_order','incoming_inspection_report','supplier_return','purchase_inbound',
    'finished_inbound','other_inbound','other_outbound','inventory_batch','stock_check',
    'production_material_outbound','production_material_return','material_loss','manual_material_demand',
    'rework','step_report','abnormal_disposition','scrap_supplement_plan','material_supplement','approval_instance'
  ));

UPDATE permissions SET name='登记其他处理说明' WHERE code='warehouse:receipts:handle';
