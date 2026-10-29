-- Do not silently discard a real master-data specification association.
CREATE TEMPORARY TABLE tmp_product_specification_rollback_guard (
  must_be_zero TINYINT NOT NULL,
  CONSTRAINT chk_product_specification_rollback_guard CHECK (must_be_zero=0)
) ENGINE=MEMORY;

INSERT INTO tmp_product_specification_rollback_guard (must_be_zero)
SELECT 1 WHERE EXISTS(SELECT 1 FROM products WHERE specification_file_id IS NOT NULL)
  OR EXISTS(SELECT 1 FROM material_variants WHERE specification_file_id IS NOT NULL);

DROP TEMPORARY TABLE tmp_product_specification_rollback_guard;

ALTER TABLE material_variants
  DROP FOREIGN KEY fk_material_variants_specification_file,
  DROP INDEX idx_material_variants_specification_file,
  DROP COLUMN specification_file_id;

ALTER TABLE products
  DROP FOREIGN KEY fk_products_specification_file,
  DROP INDEX idx_products_specification_file,
  DROP COLUMN specification_file_id;

ALTER TABLE technical_files DROP CHECK chk_technical_files_type;
