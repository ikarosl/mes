-- Rollback only on unused new business structures; never discard confirmations.
CREATE TEMPORARY TABLE guard_receipt_acceptance_down (ok TINYINT NOT NULL CHECK(ok=1));
INSERT INTO guard_receipt_acceptance_down SELECT IF(EXISTS(SELECT 1 FROM procurement_receipt) OR EXISTS(SELECT 1 FROM procurement_receipt_acceptance) OR EXISTS(SELECT 1 FROM procurement_order_line WHERE fulfillment_mode='existing_receipt'),0,1);
DROP TEMPORARY TABLE guard_receipt_acceptance_down;
DELETE rp FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE p.code='procurement:receipts:accept';
DELETE FROM permissions WHERE code='procurement:receipts:accept';
ALTER TABLE inbound_detail DROP FOREIGN KEY fk_inbound_detail_procurement_acceptance, DROP CHECK chk_inbound_detail_acceptance, DROP COLUMN procurement_acceptance_line_id;
ALTER TABLE procurement_supplier_return DROP FOREIGN KEY fk_procurement_return_acceptance, DROP CHECK chk_procurement_return_reason, DROP COLUMN acceptance_line_id,
 ADD CONSTRAINT chk_procurement_return_reason CHECK(reason_type IN('quality','procurement_termination'));
ALTER TABLE procurement_receipt_scope DROP FOREIGN KEY fk_procurement_scope_acceptance,
 DROP CHECK chk_procurement_scope_disposition, DROP CHECK chk_procurement_scope_transition,
 DROP CHECK chk_procurement_scope_quality, DROP CHECK chk_procurement_scope_formal, DROP CHECK chk_procurement_scope_inbound_quality,
 DROP COLUMN acceptance_line_id, DROP COLUMN quality_partition,
 ADD CONSTRAINT chk_procurement_scope_disposition CHECK(disposition IN('uninspected','reviewing','approved','quality_return','termination_return','inbounded','returned','superseded')),
 ADD CONSTRAINT chk_procurement_scope_transition CHECK(transition_type IN('receipt','split','inspection','review','receipt_correction','termination','inbound','return'));
DROP TABLE procurement_receipt_acceptance_line;
DROP TABLE procurement_receipt_acceptance;
ALTER TABLE procurement_order_line DROP CHECK chk_procurement_order_fulfillment, DROP CHECK chk_procurement_order_existing_receipt, DROP COLUMN fulfillment_mode;
