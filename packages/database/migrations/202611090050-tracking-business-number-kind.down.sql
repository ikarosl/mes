CREATE TEMPORARY TABLE tmp_tracking_numbering_down_guard (
 invalid_data TINYINT NOT NULL,
 CONSTRAINT chk_tracking_numbering_unused CHECK(invalid_data=0)
) ENGINE=MEMORY;
INSERT INTO tmp_tracking_numbering_down_guard(invalid_data)
 SELECT 1 WHERE EXISTS(SELECT 1 FROM business_number_daily_sequence WHERE number_kind='production_tracking_card') OR EXISTS(SELECT 1 FROM production_tracking_card);
DROP TEMPORARY TABLE tmp_tracking_numbering_down_guard;
ALTER TABLE business_number_daily_sequence
 DROP CHECK chk_business_number_kind,
 ADD CONSTRAINT `chk_business_number_kind` CHECK ((`number_kind` in (_utf8mb4'work_order',_utf8mb4'production_batch',_utf8mb4'purchase_order',_utf8mb4'purchase_receipt',_utf8mb4'incoming_inspection_order',_utf8mb4'supplier_return',_utf8mb4'purchase_inbound',_utf8mb4'finished_inbound',_utf8mb4'other_inbound',_utf8mb4'other_outbound',_utf8mb4'inventory_batch',_utf8mb4'stock_check',_utf8mb4'production_material_outbound',_utf8mb4'production_material_return',_utf8mb4'material_loss',_utf8mb4'manual_material_demand',_utf8mb4'rework',_utf8mb4'step_report',_utf8mb4'abnormal_disposition',_utf8mb4'scrap_supplement_plan',_utf8mb4'material_supplement',_utf8mb4'approval_instance')));
