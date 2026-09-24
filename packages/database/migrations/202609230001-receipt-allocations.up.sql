-- Six-table receipt model. Reset development business data before switching provenance.
CREATE TEMPORARY TABLE guard_receipt_allocations (ok TINYINT NOT NULL CHECK(ok=1));
INSERT INTO guard_receipt_allocations SELECT IF(EXISTS(SELECT 1 FROM procurement_receipt) OR EXISTS(SELECT 1 FROM procurement_order_line WHERE origin_receipt_line_id IS NOT NULL),0,1);
DROP TEMPORARY TABLE guard_receipt_allocations;
ALTER TABLE inbound_detail DROP FOREIGN KEY fk_inbound_detail_procurement_scope, DROP FOREIGN KEY fk_inbound_detail_procurement_acceptance, DROP CHECK chk_inbound_detail_procurement_source, DROP CHECK chk_inbound_detail_acceptance;
ALTER TABLE procurement_supplier_return DROP FOREIGN KEY fk_procurement_return_scope, DROP FOREIGN KEY fk_procurement_return_acceptance, DROP CHECK chk_procurement_return_basis;
ALTER TABLE procurement_order_line DROP FOREIGN KEY fk_procurement_order_origin_acceptance, DROP CHECK chk_procurement_order_quality_source, DROP CHECK chk_procurement_order_existing_receipt;
DROP TABLE procurement_receipt_scope;
DROP TABLE procurement_receipt_acceptance_line;
ALTER TABLE procurement_receipt_acceptance ADD UNIQUE KEY uk_receipt_acceptance_round_source(id,receipt_line_id,round_id);
ALTER TABLE procurement_receipt_round ADD COLUMN source_allocation_round_id BIGINT UNSIGNED NULL,
  ADD CONSTRAINT fk_round_allocation_source FOREIGN KEY(source_allocation_round_id,receipt_line_id) REFERENCES procurement_receipt_round(id,receipt_line_id),
  DROP CHECK chk_receipt_round_trigger,
  ADD CONSTRAINT chk_receipt_round_trigger CHECK(trigger_type IN('receipt','receipt_correction','review','acceptance_correction','manual_rejection','rejection_revocation'));
CREATE TABLE procurement_receipt_allocation (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  receipt_line_id BIGINT UNSIGNED NOT NULL,
  round_id BIGINT UNSIGNED NOT NULL,
  acceptance_id BIGINT UNSIGNED NULL,
  line_no INT NOT NULL,
  purchase_order_line_id BIGINT UNSIGNED NULL,
  disposition VARCHAR(30) NOT NULL,
  quantity INT NOT NULL,
  return_reason VARCHAR(30) NULL,
  termination_reason TEXT NULL,
  remark TEXT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_receipt_allocation_round_no(round_id,line_no),
  UNIQUE KEY uk_receipt_allocation_source(id,receipt_line_id),
  KEY idx_receipt_allocation_line(receipt_line_id,id),
  KEY idx_receipt_allocation_purchase(purchase_order_line_id,id),
  CONSTRAINT fk_receipt_allocation_round FOREIGN KEY(round_id,receipt_line_id) REFERENCES procurement_receipt_round(id,receipt_line_id),
  CONSTRAINT fk_receipt_allocation_acceptance FOREIGN KEY(acceptance_id,receipt_line_id,round_id) REFERENCES procurement_receipt_acceptance(id,receipt_line_id,round_id),
  CONSTRAINT fk_receipt_allocation_purchase FOREIGN KEY(purchase_order_line_id) REFERENCES procurement_order_line(id),
  CONSTRAINT fk_receipt_allocation_actor FOREIGN KEY(created_by) REFERENCES users(id),
  CONSTRAINT chk_receipt_allocation_quantity CHECK(quantity BETWEEN 1 AND 99999999 AND line_no>0),
  CONSTRAINT chk_receipt_allocation_disposition CHECK(disposition IN('inbound','return','pending')),
  CONSTRAINT chk_receipt_allocation_return CHECK((disposition='return' AND return_reason IS NOT NULL AND return_reason IN('quality','excess','procurement_termination','manual_rejection')) OR (disposition<>'return' AND return_reason IS NULL)),
  CONSTRAINT chk_receipt_allocation_basis CHECK((acceptance_id IS NULL AND disposition='return' AND return_reason='manual_rejection') OR (acceptance_id IS NOT NULL AND (return_reason IS NULL OR return_reason<>'manual_rejection'))),
  CONSTRAINT chk_receipt_allocation_inbound CHECK(disposition<>'inbound' OR purchase_order_line_id IS NOT NULL),
  CONSTRAINT chk_receipt_allocation_termination CHECK(termination_reason IS NULL OR (CHAR_LENGTH(TRIM(termination_reason))>0 AND disposition='return' AND return_reason IN('procurement_termination','manual_rejection')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TRIGGER trg_receipt_allocation_no_update BEFORE UPDATE ON procurement_receipt_allocation
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Receipt allocation facts are immutable';
CREATE TRIGGER trg_receipt_allocation_no_delete BEFORE DELETE ON procurement_receipt_allocation
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Receipt allocation facts are immutable';
ALTER TABLE inbound_detail DROP COLUMN procurement_scope_id, RENAME COLUMN procurement_acceptance_line_id TO procurement_allocation_id,
  ADD KEY idx_inbound_detail_allocation(procurement_allocation_id,id),
  ADD CONSTRAINT fk_inbound_detail_allocation FOREIGN KEY(procurement_allocation_id,procurement_receipt_line_id) REFERENCES procurement_receipt_allocation(id,receipt_line_id),
  ADD CONSTRAINT chk_inbound_detail_procurement_source CHECK(
    (procurement_receipt_line_id IS NULL AND procurement_receipt_revision_id IS NULL AND procurement_allocation_id IS NULL AND procurement_inspection_id IS NULL)
    OR (product_id IS NULL AND procurement_receipt_line_id IS NOT NULL AND procurement_receipt_revision_id IS NOT NULL AND procurement_allocation_id IS NOT NULL AND procurement_inspection_id IS NOT NULL));
ALTER TABLE procurement_supplier_return DROP COLUMN scope_id, CHANGE COLUMN acceptance_line_id allocation_id BIGINT UNSIGNED NOT NULL,
  ADD UNIQUE KEY uk_supplier_return_allocation(allocation_id),
  ADD CONSTRAINT fk_supplier_return_allocation FOREIGN KEY(allocation_id,receipt_line_id) REFERENCES procurement_receipt_allocation(id,receipt_line_id),
  ADD CONSTRAINT chk_procurement_return_basis CHECK(reason_type='manual_rejection' OR inspection_id IS NOT NULL);
ALTER TABLE procurement_order_line RENAME COLUMN origin_acceptance_line_id TO origin_allocation_id,
  ADD CONSTRAINT fk_order_origin_allocation FOREIGN KEY(origin_allocation_id,origin_receipt_line_id) REFERENCES procurement_receipt_allocation(id,receipt_line_id),
  ADD CONSTRAINT chk_procurement_order_quality_source CHECK(origin_allocation_id IS NULL OR (origin_receipt_line_id IS NOT NULL AND origin_order_line_id IS NOT NULL AND fulfillment_mode='new_arrival')),
  ADD CONSTRAINT chk_procurement_order_existing_receipt CHECK(fulfillment_mode<>'existing_receipt' OR (origin_order_line_id IS NOT NULL AND origin_receipt_line_id IS NOT NULL AND origin_allocation_id IS NULL));
