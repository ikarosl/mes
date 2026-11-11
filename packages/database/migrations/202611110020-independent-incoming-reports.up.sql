-- Warehouse simplification experiment: initialize only a separately authorized empty database.
-- Procurement/Quality/Inventory writes must remain stopped. 010 removes old cross-module references first.
-- Old incoming cases and release facts have no supported conversion to independent reports.
CREATE TEMPORARY TABLE tmp_independent_incoming_report_guard (
  invalid_data TINYINT NOT NULL,
  CONSTRAINT chk_independent_incoming_report_empty CHECK (invalid_data = 0)
) ENGINE=MEMORY;
INSERT INTO tmp_independent_incoming_report_guard (invalid_data)
SELECT 1 WHERE EXISTS (SELECT 1 FROM quality_inspection_record)
   OR EXISTS (SELECT 1 FROM quality_inspection_case);
DROP TEMPORARY TABLE tmp_independent_incoming_report_guard;

DROP TABLE quality_inspection_record;
DROP TABLE quality_inspection_case;

CREATE TABLE quality_incoming_inspection_report (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  report_no VARCHAR(64) NOT NULL,
  receipt_line_id BIGINT UNSIGNED NOT NULL,
  receipt_id BIGINT UNSIGNED NOT NULL,
  receipt_no_snapshot VARCHAR(100) NOT NULL,
  purchase_no_snapshot VARCHAR(100) NOT NULL,
  item_code_snapshot VARCHAR(100) NOT NULL,
  item_name_snapshot VARCHAR(200) NOT NULL,
  material_variant_code_snapshot VARCHAR(180) NOT NULL,
  unit_snapshot VARCHAR(20) NOT NULL,
  supplier_name_snapshot VARCHAR(100) NOT NULL,
  specification VARCHAR(2000) NULL,
  batch_no VARCHAR(120) NULL,
  expires_on DATE NULL,
  inspection_method VARCHAR(30) NOT NULL,
  qualified_quantity INT NOT NULL,
  unqualified_quantity INT NOT NULL,
  inspected_at DATETIME(3) NOT NULL,
  result_note TEXT NULL,
  evidence_reference TEXT NULL,
  report_rows JSON NOT NULL,
  previous_record_id BIGINT UNSIGNED NULL,
  correction_reason TEXT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_incoming_report_no (report_no),
  UNIQUE KEY uk_incoming_report_source (id,receipt_line_id),
  UNIQUE KEY uk_incoming_report_previous (previous_record_id),
  KEY idx_incoming_report_line_created (receipt_line_id,created_at,id),
  KEY idx_incoming_report_receipt_source (receipt_line_id,receipt_id),
  KEY idx_incoming_report_previous_source (previous_record_id,receipt_line_id),
  KEY idx_incoming_report_creator (created_by),
  CONSTRAINT fk_incoming_report_receipt_source FOREIGN KEY (receipt_line_id,receipt_id)
    REFERENCES procurement_receipt_line (id,receipt_id),
  CONSTRAINT fk_incoming_report_previous_source FOREIGN KEY (previous_record_id,receipt_line_id)
    REFERENCES quality_incoming_inspection_report (id,receipt_line_id),
  CONSTRAINT fk_incoming_report_creator FOREIGN KEY (created_by) REFERENCES users (id),
  CONSTRAINT chk_incoming_report_header CHECK (
    CHAR_LENGTH(TRIM(report_no)) > 0
    AND CHAR_LENGTH(TRIM(receipt_no_snapshot)) > 0
    AND CHAR_LENGTH(TRIM(purchase_no_snapshot)) > 0
    AND CHAR_LENGTH(TRIM(item_code_snapshot)) > 0
    AND CHAR_LENGTH(TRIM(item_name_snapshot)) > 0
    AND CHAR_LENGTH(TRIM(material_variant_code_snapshot)) > 0
    AND CHAR_LENGTH(TRIM(unit_snapshot)) > 0
    AND CHAR_LENGTH(TRIM(supplier_name_snapshot)) > 0
    AND (specification IS NULL OR CHAR_LENGTH(TRIM(specification)) > 0)
    AND (batch_no IS NULL OR CHAR_LENGTH(TRIM(batch_no)) > 0)
  ),
  CONSTRAINT chk_incoming_report_method CHECK (inspection_method IN ('full','sampling')),
  CONSTRAINT chk_incoming_report_quantities CHECK (
    qualified_quantity BETWEEN 0 AND 99999999
    AND unqualified_quantity BETWEEN 0 AND 99999999
    AND qualified_quantity + unqualified_quantity BETWEEN 1 AND 99999999
  ),
  CONSTRAINT chk_incoming_report_notes CHECK (
    (result_note IS NULL OR CHAR_LENGTH(TRIM(result_note)) BETWEEN 1 AND 4000)
    AND (evidence_reference IS NULL OR CHAR_LENGTH(TRIM(evidence_reference)) BETWEEN 1 AND 4000)
  ),
  CONSTRAINT chk_incoming_report_rows CHECK (
    JSON_TYPE(report_rows) = 'ARRAY' AND JSON_LENGTH(report_rows) BETWEEN 1 AND 100
  ),
  CONSTRAINT chk_incoming_report_correction CHECK (
    (previous_record_id IS NULL AND correction_reason IS NULL)
    OR (previous_record_id IS NOT NULL AND correction_reason IS NOT NULL
        AND CHAR_LENGTH(TRIM(correction_reason)) BETWEEN 1 AND 4000)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TRIGGER trg_incoming_report_no_update BEFORE UPDATE ON quality_incoming_inspection_report
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Incoming inspection reports are immutable';
CREATE TRIGGER trg_incoming_report_no_delete BEFORE DELETE ON quality_incoming_inspection_report
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Incoming inspection reports are immutable';

-- New reports use the common same-transaction Beijing-date allocator. Existing counter kinds stay valid.
ALTER TABLE business_number_daily_sequence
  DROP CHECK chk_business_number_kind,
  ADD CONSTRAINT chk_business_number_kind CHECK (number_kind IN (
    'production_tracking_card','work_order','production_batch','purchase_order','purchase_receipt',
    'incoming_inspection_order','incoming_inspection_report','supplier_return','purchase_inbound',
    'finished_inbound','other_inbound','other_outbound','inventory_batch','stock_check',
    'production_material_outbound','production_material_return','material_loss','manual_material_demand',
    'rework','step_report','abnormal_disposition','scrap_supplement_plan','material_supplement','approval_instance'
  ));
