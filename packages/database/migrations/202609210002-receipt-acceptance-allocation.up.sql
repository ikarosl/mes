-- Physical receipt first, immutable warehouse confirmation and procurement allocation second.
CREATE TEMPORARY TABLE guard_receipt_acceptance (ok TINYINT NOT NULL CHECK(ok=1));
INSERT INTO guard_receipt_acceptance SELECT IF(EXISTS(SELECT 1 FROM procurement_receipt) OR EXISTS(SELECT 1 FROM procurement_order_line WHERE origin_order_line_id IS NOT NULL),0,1);
DROP TEMPORARY TABLE guard_receipt_acceptance;
ALTER TABLE procurement_order_line
  ADD COLUMN fulfillment_mode VARCHAR(30) NOT NULL DEFAULT 'new_arrival',
  ADD CONSTRAINT chk_procurement_order_fulfillment CHECK(fulfillment_mode IN('new_arrival','existing_receipt')),
  ADD CONSTRAINT chk_procurement_order_existing_receipt CHECK(fulfillment_mode<>'existing_receipt' OR
    (origin_order_line_id IS NOT NULL AND origin_receipt_line_id IS NOT NULL AND origin_supplier_return_id IS NULL));
CREATE TABLE procurement_receipt_acceptance (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  receipt_line_id BIGINT UNSIGNED NOT NULL,
  inspection_record_id BIGINT UNSIGNED NOT NULL,
  source_scope_id BIGINT UNSIGNED NULL,
  before_receipt_revision_id BIGINT UNSIGNED NOT NULL,
  after_receipt_revision_id BIGINT UNSIGNED NOT NULL,
  confirmed_scope_quantity INT NOT NULL,
  previous_acceptance_id BIGINT UNSIGNED NULL,
  zero_scope_inspection_id BIGINT UNSIGNED GENERATED ALWAYS AS (IF(source_scope_id IS NULL,inspection_record_id,NULL)) STORED,
  remark TEXT NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_receipt_acceptance_line(id,receipt_line_id),
  UNIQUE KEY uk_receipt_acceptance_scope(source_scope_id),
  UNIQUE KEY uk_receipt_acceptance_zero(zero_scope_inspection_id),
  KEY idx_receipt_acceptance_history(receipt_line_id,id),
  CONSTRAINT fk_receipt_acceptance_receipt FOREIGN KEY(receipt_line_id) REFERENCES procurement_receipt_line(id),
  CONSTRAINT fk_receipt_acceptance_inspection FOREIGN KEY(inspection_record_id,receipt_line_id) REFERENCES quality_inspection_record(id,receipt_line_id),
  CONSTRAINT fk_receipt_acceptance_scope FOREIGN KEY(source_scope_id,receipt_line_id) REFERENCES procurement_receipt_scope(id,receipt_line_id),
  CONSTRAINT fk_receipt_acceptance_before FOREIGN KEY(before_receipt_revision_id,receipt_line_id) REFERENCES procurement_receipt_revision(id,receipt_line_id),
  CONSTRAINT fk_receipt_acceptance_after FOREIGN KEY(after_receipt_revision_id,receipt_line_id) REFERENCES procurement_receipt_revision(id,receipt_line_id),
  CONSTRAINT fk_receipt_acceptance_previous FOREIGN KEY(previous_acceptance_id,receipt_line_id) REFERENCES procurement_receipt_acceptance(id,receipt_line_id),
  CONSTRAINT fk_receipt_acceptance_actor FOREIGN KEY(created_by) REFERENCES users(id),
  CONSTRAINT chk_receipt_acceptance_quantity CHECK(confirmed_scope_quantity BETWEEN 0 AND 99999999),
  CONSTRAINT chk_receipt_acceptance_scope CHECK(source_scope_id IS NOT NULL OR confirmed_scope_quantity=0),
  CONSTRAINT chk_receipt_acceptance_remark CHECK(CHAR_LENGTH(TRIM(remark))>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE procurement_receipt_acceptance_line (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  acceptance_id BIGINT UNSIGNED NOT NULL,
  receipt_line_id BIGINT UNSIGNED NOT NULL,
  line_no INT NOT NULL,
  purchase_order_line_id BIGINT UNSIGNED NULL,
  disposition VARCHAR(30) NOT NULL,
  quantity INT NOT NULL,
  return_reason VARCHAR(30) NULL,
  quality_partition VARCHAR(30) NOT NULL,
  remark TEXT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_receipt_acceptance_detail_no(acceptance_id,line_no),
  UNIQUE KEY uk_receipt_acceptance_detail_source(id,receipt_line_id),
  KEY idx_receipt_acceptance_purchase(purchase_order_line_id,id),
  CONSTRAINT fk_receipt_acceptance_detail_header FOREIGN KEY(acceptance_id,receipt_line_id) REFERENCES procurement_receipt_acceptance(id,receipt_line_id),
  CONSTRAINT fk_receipt_acceptance_detail_purchase FOREIGN KEY(purchase_order_line_id) REFERENCES procurement_order_line(id),
  CONSTRAINT fk_receipt_acceptance_detail_actor FOREIGN KEY(created_by) REFERENCES users(id),
  CONSTRAINT chk_receipt_acceptance_detail_quantity CHECK(quantity BETWEEN 1 AND 99999999 AND line_no>0),
  CONSTRAINT chk_receipt_acceptance_detail_disposition CHECK(disposition IN('inbound','return','pending')),
  CONSTRAINT chk_receipt_acceptance_detail_quality CHECK(quality_partition IN('released','unqualified','held')),
  CONSTRAINT chk_receipt_acceptance_detail_return CHECK(
    (disposition='return' AND return_reason IS NOT NULL AND return_reason IN('quality','excess','procurement_termination'))
    OR (disposition<>'return' AND return_reason IS NULL)),
  CONSTRAINT chk_receipt_acceptance_detail_inbound CHECK(disposition<>'inbound' OR
    (purchase_order_line_id IS NOT NULL AND quality_partition='released'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
ALTER TABLE procurement_receipt_scope
  DROP CHECK chk_procurement_scope_disposition,
  DROP CHECK chk_procurement_scope_transition,
  ADD COLUMN acceptance_line_id BIGINT UNSIGNED NULL,
  ADD COLUMN quality_partition VARCHAR(30) NOT NULL DEFAULT 'held',
  ADD CONSTRAINT fk_procurement_scope_acceptance FOREIGN KEY(acceptance_line_id,receipt_line_id) REFERENCES procurement_receipt_acceptance_line(id,receipt_line_id),
  ADD CONSTRAINT chk_procurement_scope_quality CHECK(quality_partition IN('released','unqualified','held')),
  ADD CONSTRAINT chk_procurement_scope_disposition CHECK(disposition IN('uninspected','reviewing','awaiting_acceptance','pending','approved','quality_return','excess_return','termination_return','inbounded','returned','superseded')),
  ADD CONSTRAINT chk_procurement_scope_transition CHECK(transition_type IN('receipt','split','inspection','review','receipt_correction','acceptance','termination','inbound','return')),
  ADD CONSTRAINT chk_procurement_scope_formal CHECK(disposition NOT IN('approved','quality_return','excess_return','termination_return','pending','inbounded','returned') OR acceptance_line_id IS NOT NULL),
  ADD CONSTRAINT chk_procurement_scope_inbound_quality CHECK(disposition NOT IN('approved','inbounded') OR quality_partition='released');
ALTER TABLE procurement_supplier_return
  DROP CHECK chk_procurement_return_reason,
  ADD COLUMN acceptance_line_id BIGINT UNSIGNED NOT NULL,
  ADD CONSTRAINT fk_procurement_return_acceptance FOREIGN KEY(acceptance_line_id,receipt_line_id) REFERENCES procurement_receipt_acceptance_line(id,receipt_line_id),
  ADD CONSTRAINT chk_procurement_return_reason CHECK(reason_type IN('quality','excess','procurement_termination'));
ALTER TABLE inbound_detail
  ADD COLUMN procurement_acceptance_line_id BIGINT UNSIGNED NULL,
  ADD CONSTRAINT fk_inbound_detail_procurement_acceptance FOREIGN KEY(procurement_acceptance_line_id,procurement_receipt_line_id) REFERENCES procurement_receipt_acceptance_line(id,receipt_line_id),
  ADD CONSTRAINT chk_inbound_detail_acceptance CHECK(
    (procurement_receipt_line_id IS NULL AND procurement_acceptance_line_id IS NULL)
    OR (procurement_receipt_line_id IS NOT NULL AND procurement_acceptance_line_id IS NOT NULL));
CREATE TRIGGER trg_procurement_receipt_acceptance_no_update BEFORE UPDATE ON procurement_receipt_acceptance
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Receipt acceptance facts are immutable';
CREATE TRIGGER trg_procurement_receipt_acceptance_no_delete BEFORE DELETE ON procurement_receipt_acceptance
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Receipt acceptance facts are immutable';
CREATE TRIGGER trg_procurement_receipt_acceptance_line_no_update BEFORE UPDATE ON procurement_receipt_acceptance_line
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Receipt acceptance facts are immutable';
CREATE TRIGGER trg_procurement_receipt_acceptance_line_no_delete BEFORE DELETE ON procurement_receipt_acceptance_line
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Receipt acceptance facts are immutable';
INSERT INTO permissions(parent_id,name,code,type,route_path,api_method,api_path,sort_order,status)
SELECT id,'核对并确认来料清单','procurement:receipts:accept','button',NULL,'POST','/api/procurement/receipt-lines/*/actions/accept',264,1 FROM permissions WHERE code='procurement:receipts:view';
