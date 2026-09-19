-- Restore the original names before any preceding Product migration is reversed.
-- Matching application rollback and paused Product writes are required.
RENAME TABLE item_categories TO product_categories;

ALTER TABLE product_categories
  RENAME INDEX uk_item_categories_code TO uk_product_categories_code,
  RENAME INDEX idx_item_categories_parent TO idx_product_categories_parent,
  RENAME INDEX fk_item_categories_created_by TO fk_product_categories_created_by,
  RENAME INDEX fk_item_categories_updated_by TO fk_product_categories_updated_by,
  RENAME INDEX fk_item_categories_deleted_by TO fk_product_categories_deleted_by,
  DROP FOREIGN KEY fk_item_categories_parent,
  DROP FOREIGN KEY fk_item_categories_created_by,
  DROP FOREIGN KEY fk_item_categories_updated_by,
  DROP FOREIGN KEY fk_item_categories_deleted_by,
  DROP CHECK chk_item_categories_kind,
  DROP CHECK chk_item_categories_status,
  DROP CHECK chk_item_categories_deleted,
  ADD CONSTRAINT fk_product_categories_parent FOREIGN KEY (parent_id) REFERENCES product_categories(id),
  ADD CONSTRAINT fk_product_categories_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  ADD CONSTRAINT fk_product_categories_updated_by FOREIGN KEY (updated_by) REFERENCES users(id),
  ADD CONSTRAINT fk_product_categories_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id),
  ADD CONSTRAINT chk_product_categories_kind CHECK (item_kind IN ('material', 'finished_product')),
  ADD CONSTRAINT chk_product_categories_status CHECK (status IN (0, 1)),
  ADD CONSTRAINT chk_product_categories_deleted CHECK (is_deleted IN (0, 1));
