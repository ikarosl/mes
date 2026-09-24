-- A multi-supplier order cannot be represented by the previous header-supplier contract.
CREATE TEMPORARY TABLE tmp_procurement_order_sources_rollback_guard (
  invalid_value TINYINT NOT NULL CHECK(invalid_value=0)
) ENGINE=MEMORY;
INSERT INTO tmp_procurement_order_sources_rollback_guard SELECT 1 WHERE EXISTS(SELECT 1 FROM procurement_order);
DROP TEMPORARY TABLE tmp_procurement_order_sources_rollback_guard;

DROP TRIGGER trg_procurement_order_closure_no_update;
DROP TRIGGER trg_procurement_order_closure_no_delete;

ALTER TABLE procurement_order_line
  DROP FOREIGN KEY fk_procurement_order_line_supplier,
  DROP INDEX idx_procurement_order_line_supplier,
  DROP INDEX uk_procurement_order_line_identity,
  DROP COLUMN supplier_id,
  ADD UNIQUE KEY uk_purchase_order_line_identity(purchase_order_id,item_id,material_variant_id);

ALTER TABLE procurement_order
  DROP CHECK chk_procurement_order_work_order,
  DROP FOREIGN KEY fk_procurement_order_work_order,
  DROP INDEX idx_procurement_order_work_order,
  DROP COLUMN work_order_id,
  ADD COLUMN supplier_id BIGINT UNSIGNED NOT NULL AFTER purchase_no,
  ADD KEY idx_purchase_order_supplier(supplier_id,created_at,id),
  ADD CONSTRAINT fk_purchase_order_supplier FOREIGN KEY(supplier_id) REFERENCES procurement_supplier(id);

RENAME TABLE procurement_order TO purchase_order,
  procurement_order_line TO purchase_order_line,
  procurement_order_line_source TO purchase_order_line_source,
  procurement_order_line_closure TO purchase_order_line_closure;

CREATE TRIGGER trg_purchase_order_closure_no_update BEFORE UPDATE ON purchase_order_line_closure
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Purchase order closure facts are immutable';
END;
CREATE TRIGGER trg_purchase_order_closure_no_delete BEFORE DELETE ON purchase_order_line_closure
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Purchase order closure facts cannot be deleted';
END;
