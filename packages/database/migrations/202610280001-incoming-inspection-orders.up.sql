-- Deploy before enabling incoming-inspection grouping writers. Existing receipts
-- and immutable inspection facts remain ungrouped and are never rewritten.
CREATE TABLE quality_incoming_inspection_order (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  inspection_no VARCHAR(64) NOT NULL,
  remark VARCHAR(500) NULL,
  version INT UNSIGNED NOT NULL DEFAULT 0,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_incoming_inspection_order_no (inspection_no),
  KEY idx_incoming_inspection_order_created (created_at,id),
  CONSTRAINT fk_incoming_inspection_order_creator FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_incoming_inspection_order_updater FOREIGN KEY (updated_by) REFERENCES users(id),
  CONSTRAINT chk_incoming_inspection_order_no CHECK (CHAR_LENGTH(TRIM(inspection_no))>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE quality_incoming_inspection_order_receipt (
  inspection_order_id BIGINT UNSIGNED NOT NULL,
  receipt_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (inspection_order_id,receipt_id),
  UNIQUE KEY uk_incoming_inspection_order_receipt (receipt_id),
  CONSTRAINT fk_incoming_inspection_order_receipt_order FOREIGN KEY (inspection_order_id) REFERENCES quality_incoming_inspection_order(id),
  CONSTRAINT fk_incoming_inspection_order_receipt_source FOREIGN KEY (receipt_id) REFERENCES procurement_receipt(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE business_number_daily_sequence
  DROP CHECK chk_business_number_kind,
  ADD CONSTRAINT chk_business_number_kind CHECK(number_kind IN(
    'work_order','production_batch','purchase_order','purchase_receipt',
    'incoming_inspection_order','supplier_return','purchase_inbound','finished_inbound',
    'other_inbound','other_outbound','inventory_batch','stock_check',
    'production_material_outbound','production_material_return','material_loss',
    'manual_material_demand','rework','step_report','abnormal_disposition',
    'scrap_supplement_plan','material_supplement','approval_instance'
  ));

INSERT INTO permissions (parent_id,name,code,type,route_path,api_method,api_path,sort_order,status)
SELECT id,'管理来料质检分组','quality:inbound-inspections:manage','button',NULL,NULL,NULL,30,1
FROM permissions WHERE code='quality:inbound-inspections:view';
