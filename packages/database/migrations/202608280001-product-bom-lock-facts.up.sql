ALTER TABLE products
  ADD COLUMN bom_locked_at DATETIME NULL AFTER default_route_id,
  ADD COLUMN bom_locked_by BIGINT UNSIGNED NULL AFTER bom_locked_at,
  ADD KEY idx_products_bom_locked_by (bom_locked_by),
  ADD CONSTRAINT chk_products_bom_lock_fact
    CHECK (bom_locked_at IS NOT NULL OR bom_locked_by IS NULL),
  ADD CONSTRAINT fk_products_bom_locked_by
    FOREIGN KEY (bom_locked_by) REFERENCES users(id);

UPDATE products p
JOIN (
  SELECT first_batch.product_id,first_batch.created_at,first_batch.created_by
  FROM production_batches first_batch
  JOIN (
    SELECT product_id,MIN(id) first_batch_id
    FROM production_batches
    GROUP BY product_id
  ) first_ids ON first_ids.first_batch_id=first_batch.id
) historical ON historical.product_id=p.id
SET p.bom_locked_at=historical.created_at,
    p.bom_locked_by=historical.created_by
WHERE p.bom_locked_at IS NULL;
