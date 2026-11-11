-- Do not invent evidence for registrations created under the optional contract.
CREATE TEMPORARY TABLE tmp_arrival_evidence_down_guard (invalid_count INT NOT NULL CHECK(invalid_count=0));
INSERT INTO tmp_arrival_evidence_down_guard
SELECT COUNT(*) FROM procurement_receipt WHERE handover_evidence IS NULL OR CHAR_LENGTH(TRIM(handover_evidence))=0;
DROP TEMPORARY TABLE tmp_arrival_evidence_down_guard;
ALTER TABLE procurement_receipt
  MODIFY COLUMN handover_evidence TEXT NOT NULL,
  ADD CONSTRAINT chk_procurement_receipt_evidence CHECK(CHAR_LENGTH(TRIM(handover_evidence))>0);
