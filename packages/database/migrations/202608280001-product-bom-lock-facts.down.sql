ALTER TABLE products
  DROP FOREIGN KEY fk_products_bom_locked_by,
  DROP CHECK chk_products_bom_lock_fact,
  DROP INDEX idx_products_bom_locked_by,
  DROP COLUMN bom_locked_by,
  DROP COLUMN bom_locked_at;
