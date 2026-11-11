-- Arrival registration may omit handover evidence; historical evidence remains unchanged.
ALTER TABLE procurement_receipt
  DROP CHECK chk_procurement_receipt_evidence,
  MODIFY COLUMN handover_evidence TEXT NULL;
