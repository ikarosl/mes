CREATE TEMPORARY TABLE tmp_procurement_receipt_down_guard (invalid_value TINYINT NOT NULL CHECK(invalid_value=0)) ENGINE=MEMORY;
INSERT INTO tmp_procurement_receipt_down_guard SELECT 1 WHERE EXISTS(SELECT 1 FROM procurement_receipt) OR EXISTS(SELECT 1 FROM quality_inbound_case);
DROP TEMPORARY TABLE tmp_procurement_receipt_down_guard;

ALTER TABLE inbound_detail
  DROP FOREIGN KEY fk_inbound_detail_procurement_revision,
  DROP FOREIGN KEY fk_inbound_detail_procurement_scope,
  DROP FOREIGN KEY fk_inbound_detail_procurement_inspection,
  DROP FOREIGN KEY fk_inbound_detail_procurement_material,
  DROP CHECK chk_inbound_detail_procurement_source,
  DROP INDEX uk_inbound_detail_procurement_scope,
  DROP INDEX idx_inbound_detail_procurement_receipt,
  DROP INDEX idx_inbound_detail_procurement_inspection,
  DROP COLUMN procurement_receipt_line_id,
  DROP COLUMN procurement_receipt_revision_id,
  DROP COLUMN procurement_scope_id,
  DROP COLUMN procurement_inspection_id,
  ADD UNIQUE KEY uk_inbound_detail_order_batch_item(inbound_id,batch_id,item_id);
ALTER TABLE purchase_order_line
  DROP FOREIGN KEY fk_purchase_order_line_origin_receipt,
  DROP FOREIGN KEY fk_purchase_order_line_origin_return,
  DROP CHECK chk_purchase_order_line_return_source,
  DROP COLUMN origin_receipt_line_id,
  DROP COLUMN origin_supplier_return_id;
DROP TRIGGER trg_procurement_receipt_batch_bind;
DROP TRIGGER trg_procurement_receipt_no_update;
DROP TRIGGER trg_procurement_receipt_no_delete;
DROP TRIGGER trg_procurement_receipt_revision_no_update;
DROP TRIGGER trg_procurement_receipt_revision_no_delete;
DROP TRIGGER trg_procurement_supplier_return_no_update;
DROP TRIGGER trg_procurement_supplier_return_no_delete;
DROP TRIGGER trg_quality_inbound_inspection_no_update;
DROP TRIGGER trg_quality_inbound_inspection_no_delete;
ALTER TABLE procurement_receipt_scope
  DROP FOREIGN KEY fk_procurement_scope_inspection,
  DROP FOREIGN KEY fk_procurement_scope_case;
ALTER TABLE procurement_receipt_line DROP FOREIGN KEY fk_procurement_receipt_current_revision;
DROP TABLE procurement_supplier_return;
DROP TABLE quality_inbound_inspection;
DROP TABLE quality_inbound_case;
DROP TABLE procurement_receipt_scope;
DROP TABLE procurement_receipt_revision;
DROP TABLE procurement_receipt_line;
DROP TABLE procurement_receipt;
DELETE FROM role_permissions WHERE permission_id IN (
  SELECT id FROM permissions WHERE code IN ('procurement:receipts:view','procurement:receipts:confirm','procurement:receipts:correct','procurement:receipts:return','quality:inbound-inspections:view','quality:inbound-inspections:review','quality:inbound-inspections:inspect')
);
DELETE FROM permissions WHERE code IN ('procurement:receipts:confirm','procurement:receipts:correct','procurement:receipts:return','quality:inbound-inspections:review','quality:inbound-inspections:inspect');
DELETE FROM permissions WHERE code IN ('procurement:receipts:view','quality:inbound-inspections:view');

