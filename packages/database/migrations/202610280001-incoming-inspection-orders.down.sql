-- Stop grouping writers and roll back the matching application. All guards run
-- before permanent DDL; issued group numbers and business facts are not discarded.
CREATE TEMPORARY TABLE guard_incoming_inspection_orders_empty (ok TINYINT NOT NULL CHECK(ok=1));
INSERT INTO guard_incoming_inspection_orders_empty SELECT IF(
  EXISTS(SELECT 1 FROM quality_incoming_inspection_order)
  OR EXISTS(SELECT 1 FROM quality_incoming_inspection_order_receipt)
  OR EXISTS(SELECT 1 FROM business_number_daily_sequence WHERE number_kind='incoming_inspection_order'),0,1);
DROP TEMPORARY TABLE guard_incoming_inspection_orders_empty;

DROP TABLE quality_incoming_inspection_order_receipt;
DROP TABLE quality_incoming_inspection_order;

ALTER TABLE business_number_daily_sequence
  DROP CHECK chk_business_number_kind,
  ADD CONSTRAINT chk_business_number_kind CHECK(number_kind IN(
    'work_order','production_batch','purchase_order','purchase_receipt',
    'supplier_return','purchase_inbound','finished_inbound','other_inbound','other_outbound',
    'inventory_batch','stock_check','production_material_outbound','production_material_return',
    'material_loss','manual_material_demand','rework','step_report','abnormal_disposition',
    'scrap_supplement_plan','material_supplement','approval_instance'
  ));

START TRANSACTION;
DELETE rp FROM role_permissions rp
JOIN permissions p ON p.id=rp.permission_id
WHERE p.code='quality:inbound-inspections:manage';
DELETE FROM permissions WHERE code='quality:inbound-inspections:manage';
COMMIT;
