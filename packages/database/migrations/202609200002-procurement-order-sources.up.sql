-- The new per-line supplier and single-work-order intent cannot be inferred from old orders.
-- Reset development business data through the unified initialization entry before cutover.
CREATE TEMPORARY TABLE tmp_procurement_order_sources_guard (
  invalid_value TINYINT NOT NULL CHECK(invalid_value=0)
) ENGINE=MEMORY;
INSERT INTO tmp_procurement_order_sources_guard SELECT 1 WHERE EXISTS(SELECT 1 FROM purchase_order);
DROP TEMPORARY TABLE tmp_procurement_order_sources_guard;

RENAME TABLE purchase_order TO procurement_order,
  purchase_order_line TO procurement_order_line,
  purchase_order_line_source TO procurement_order_line_source,
  purchase_order_line_closure TO procurement_order_line_closure;

ALTER TABLE procurement_order
  DROP FOREIGN KEY fk_purchase_order_supplier,
  DROP INDEX idx_purchase_order_supplier,
  DROP COLUMN supplier_id,
  ADD COLUMN work_order_id BIGINT UNSIGNED NULL AFTER purchase_no,
  ADD KEY idx_procurement_order_work_order(work_order_id,created_at,id),
  ADD CONSTRAINT fk_procurement_order_work_order FOREIGN KEY(work_order_id) REFERENCES work_orders(id),
  ADD CONSTRAINT chk_procurement_order_work_order CHECK(
    (source_type='demand' AND work_order_id IS NOT NULL)
    OR (source_type='stock' AND work_order_id IS NULL)
  );

ALTER TABLE procurement_order_line
  ADD COLUMN supplier_id BIGINT UNSIGNED NOT NULL AFTER line_no,
  DROP INDEX uk_purchase_order_line_identity,
  ADD UNIQUE KEY uk_procurement_order_line_identity(purchase_order_id,item_id,material_variant_id,supplier_id),
  ADD KEY idx_procurement_order_line_supplier(supplier_id,purchase_order_id,id),
  ADD CONSTRAINT fk_procurement_order_line_supplier FOREIGN KEY(supplier_id) REFERENCES procurement_supplier(id);

-- RENAME TABLE preserves all receipt, source, closure and supplement foreign-key targets.
DROP TRIGGER trg_purchase_order_closure_no_update;
DROP TRIGGER trg_purchase_order_closure_no_delete;
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
