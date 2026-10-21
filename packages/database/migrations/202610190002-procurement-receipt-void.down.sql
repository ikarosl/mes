-- Stop the same writers as up. A receipt created under the new audit/version contract
-- cannot be downgraded without losing that contract; rebuild empty development data.
-- Terminal rounds also cannot be reinterpreted as ordinary processing rounds.
CREATE TEMPORARY TABLE guard_receipt_void_rollback (ok TINYINT NOT NULL CHECK(ok=1));
INSERT INTO guard_receipt_void_rollback SELECT IF(
  EXISTS(SELECT 1 FROM procurement_receipt)
  OR EXISTS(SELECT 1 FROM procurement_receipt_round WHERE status='voided' OR trigger_type='receipt_void'),0,1);
DROP TEMPORARY TABLE guard_receipt_void_rollback;

DROP TRIGGER trg_procurement_receipt_void_update;
CREATE TRIGGER trg_procurement_receipt_no_update BEFORE UPDATE ON procurement_receipt
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Procurement receipt facts are immutable';
END;

ALTER TABLE procurement_receipt
  DROP FOREIGN KEY fk_procurement_receipt_voided_by,
  DROP FOREIGN KEY fk_procurement_receipt_updater,
  DROP INDEX idx_procurement_receipt_voided_by,
  DROP INDEX idx_procurement_receipt_updater,
  DROP CHECK chk_procurement_receipt_void_flag,
  DROP CHECK chk_procurement_receipt_void_fields,
  DROP CHECK chk_procurement_receipt_version,
  DROP COLUMN is_voided,
  DROP COLUMN void_reason,
  DROP COLUMN voided_by,
  DROP COLUMN voided_at,
  DROP COLUMN updated_by,
  DROP COLUMN updated_at,
  DROP COLUMN version;

DELETE rp FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id
WHERE p.code='warehouse:receipts:void';
DELETE FROM permissions WHERE code='warehouse:receipts:void';
ALTER TABLE procurement_receipt_round
  DROP CHECK chk_receipt_round_status,
  DROP CHECK chk_receipt_round_trigger,
  ADD CONSTRAINT chk_receipt_round_status CHECK(status IN('uninspected','reviewing','reinspection_required','quality_rejected','awaiting_acceptance','finalized','superseded')),
  ADD CONSTRAINT chk_receipt_round_trigger CHECK(trigger_type IN('receipt','receipt_correction','review','acceptance_correction','manual_rejection','rejection_revocation'));
