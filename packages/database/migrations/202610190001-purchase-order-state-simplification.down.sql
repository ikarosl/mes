-- Manual follow-up has no closure facts to restore. Refuse any purchase data before DDL.
CREATE TEMPORARY TABLE guard_purchase_order_state_simplification_rollback (ok TINYINT NOT NULL CHECK(ok=1));
INSERT INTO guard_purchase_order_state_simplification_rollback
SELECT IF(EXISTS(SELECT 1 FROM procurement_order),0,1);
DROP TEMPORARY TABLE guard_purchase_order_state_simplification_rollback;

CREATE TABLE procurement_order_line_closure (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  purchase_order_line_id BIGINT UNSIGNED NOT NULL,
  reason_type VARCHAR(30) NOT NULL,
  reason TEXT NULL,
  planned_quantity INT NOT NULL,
  received_quantity INT NOT NULL,
  undetermined_quantity INT NOT NULL,
  approved_quantity INT NOT NULL,
  inbound_quantity INT NOT NULL,
  return_due_quantity INT NOT NULL,
  returned_quantity INT NOT NULL,
  quality_returned_quantity INT NOT NULL,
  evidence_json JSON NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id),
  UNIQUE KEY uk_purchase_order_closure_line(purchase_order_line_id),
  CONSTRAINT fk_purchase_order_closure_line FOREIGN KEY(purchase_order_line_id) REFERENCES procurement_order_line(id),
  CONSTRAINT fk_purchase_order_closure_creator FOREIGN KEY(created_by) REFERENCES users(id),
  CONSTRAINT chk_purchase_order_closure_reason CHECK(reason_type IN ('quality_target','quality_return_completed','manual_end','cancelled')),
  CONSTRAINT chk_purchase_order_closure_required_reason CHECK(reason_type NOT IN ('manual_end','cancelled') OR (reason IS NOT NULL AND CHAR_LENGTH(TRIM(reason))>0)),
  CONSTRAINT chk_purchase_order_closure_quantities CHECK(
    planned_quantity BETWEEN 1 AND 99999999 AND received_quantity BETWEEN 0 AND 99999999
    AND undetermined_quantity BETWEEN 0 AND 99999999 AND approved_quantity BETWEEN 0 AND 99999999
    AND inbound_quantity BETWEEN 0 AND 99999999 AND return_due_quantity BETWEEN 0 AND 99999999
    AND returned_quantity BETWEEN 0 AND 99999999 AND quality_returned_quantity BETWEEN 0 AND 99999999
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TRIGGER trg_procurement_order_closure_no_update BEFORE UPDATE ON procurement_order_line_closure
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Procurement order closure facts are immutable';
END;
CREATE TRIGGER trg_procurement_order_closure_no_delete BEFORE DELETE ON procurement_order_line_closure
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Procurement order closure facts cannot be deleted';
END;
