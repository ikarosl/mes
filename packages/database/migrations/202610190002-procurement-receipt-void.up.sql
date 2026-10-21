-- Stop procurement, receipt, incoming inspection and purchased inbound writers.
-- Existing receipt roots have no mutable audit/version contract. Rebuild development data
-- through db:init instead of inventing update responsibility or a compatibility backfill.
CREATE TEMPORARY TABLE guard_receipt_void_empty (ok TINYINT NOT NULL CHECK(ok=1));
INSERT INTO guard_receipt_void_empty SELECT IF(EXISTS(SELECT 1 FROM procurement_receipt),0,1);
DROP TEMPORARY TABLE guard_receipt_void_empty;

ALTER TABLE procurement_receipt
  ADD COLUMN is_voided TINYINT NOT NULL DEFAULT 0,
  ADD COLUMN void_reason TEXT NULL,
  ADD COLUMN voided_by BIGINT UNSIGNED NULL,
  ADD COLUMN voided_at DATETIME NULL,
  ADD COLUMN updated_by BIGINT UNSIGNED NOT NULL,
  ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  ADD COLUMN version INT NOT NULL DEFAULT 0,
  ADD KEY idx_procurement_receipt_voided_by(voided_by),
  ADD KEY idx_procurement_receipt_updater(updated_by),
  ADD CONSTRAINT fk_procurement_receipt_voided_by FOREIGN KEY(voided_by) REFERENCES users(id),
  ADD CONSTRAINT fk_procurement_receipt_updater FOREIGN KEY(updated_by) REFERENCES users(id),
  ADD CONSTRAINT chk_procurement_receipt_void_flag CHECK(is_voided IN(0,1)),
  ADD CONSTRAINT chk_procurement_receipt_void_fields CHECK(
    (is_voided=0 AND void_reason IS NULL AND voided_by IS NULL AND voided_at IS NULL)
    OR (is_voided=1 AND void_reason IS NOT NULL AND voided_by IS NOT NULL AND voided_at IS NOT NULL
      AND CHAR_LENGTH(TRIM(void_reason)) BETWEEN 1 AND 2000)
  ),
  ADD CONSTRAINT chk_procurement_receipt_version CHECK(version>=0);

DROP TRIGGER trg_procurement_receipt_no_update;
CREATE TRIGGER trg_procurement_receipt_void_update BEFORE UPDATE ON procurement_receipt
FOR EACH ROW
BEGIN
  IF NOT(NEW.id <=> OLD.id)
    OR NOT(CAST(NEW.receipt_no AS BINARY) <=> CAST(OLD.receipt_no AS BINARY))
    OR NOT(NEW.purchase_order_id <=> OLD.purchase_order_id)
    OR NOT(NEW.received_at <=> OLD.received_at)
    OR NOT(CAST(NEW.handover_evidence AS BINARY) <=> CAST(OLD.handover_evidence AS BINARY))
    OR NOT(CAST(NEW.remark AS BINARY) <=> CAST(OLD.remark AS BINARY))
    OR NOT(NEW.created_by <=> OLD.created_by) OR NOT(NEW.created_at <=> OLD.created_at) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Receipt registration fields are immutable';
  END IF;
  IF OLD.is_voided<>0 OR NEW.is_voided<>1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Receipt can only be voided once';
  END IF;
  IF NEW.version<>OLD.version+1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Receipt void must increment version once';
  END IF;
END;

ALTER TABLE procurement_receipt_round
  DROP CHECK chk_receipt_round_status,
  DROP CHECK chk_receipt_round_trigger,
  ADD CONSTRAINT chk_receipt_round_status CHECK(status IN('uninspected','reviewing','reinspection_required','quality_rejected','awaiting_acceptance','finalized','superseded','voided')),
  ADD CONSTRAINT chk_receipt_round_trigger CHECK(trigger_type IN('receipt','receipt_correction','review','acceptance_correction','manual_rejection','rejection_revocation','receipt_void'));

INSERT INTO permissions(parent_id,name,code,type,route_path,api_method,api_path,sort_order,status)
SELECT id,'作废到货登记','warehouse:receipts:void','button',NULL,NULL,NULL,50,1
FROM permissions WHERE code='warehouse:receipts:view'
ON DUPLICATE KEY UPDATE parent_id=VALUES(parent_id),name=VALUES(name),type=VALUES(type),
  route_path=VALUES(route_path),api_method=VALUES(api_method),api_path=VALUES(api_path),
  sort_order=VALUES(sort_order),status=1,deleted_at=NULL;
