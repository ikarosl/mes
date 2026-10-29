-- Existing master rows retain NULL until an actual specification is uploaded and bound.
-- A file cannot be physically deleted while either master record still references it.
ALTER TABLE technical_files
  ADD CONSTRAINT chk_technical_files_type CHECK (file_type IN ('sop', 'specification'));

ALTER TABLE products
  ADD COLUMN specification_file_id BIGINT UNSIGNED NULL AFTER spec_values,
  ADD KEY idx_products_specification_file (specification_file_id),
  ADD CONSTRAINT fk_products_specification_file
    FOREIGN KEY (specification_file_id) REFERENCES technical_files(id) ON DELETE RESTRICT;

ALTER TABLE material_variants
  ADD COLUMN specification_file_id BIGINT UNSIGNED NULL AFTER variant_code,
  ADD KEY idx_material_variants_specification_file (specification_file_id),
  ADD CONSTRAINT fk_material_variants_specification_file
    FOREIGN KEY (specification_file_id) REFERENCES technical_files(id) ON DELETE RESTRICT;
