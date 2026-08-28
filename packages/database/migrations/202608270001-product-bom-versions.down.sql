DROP TRIGGER IF EXISTS trg_product_bom_lines_reject_non_draft_delete;
DROP TRIGGER IF EXISTS trg_product_bom_lines_reject_non_draft_update;
DROP TRIGGER IF EXISTS trg_product_bom_lines_reject_non_draft_insert;

ALTER TABLE products
  DROP FOREIGN KEY fk_products_current_bom_version_owner,
  DROP KEY idx_products_current_bom_version_owner,
  DROP COLUMN current_bom_version_id;

DROP TABLE product_bom_version_lines;
DROP TABLE product_bom_versions;

DELETE FROM permissions WHERE code IN (
  'product:bom-versions:view',
  'product:bom-versions:edit-draft',
  'product:bom-versions:publish'
);

INSERT INTO permissions (parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
SELECT id, '维护产品BOM', 'product:products:manage-bom', 'api', NULL, 'PUT', '/api/product/products/:id/materials', 114, 1
FROM permissions WHERE code = 'product:view'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name = VALUES(name),
  type = VALUES(type),
  route_path = VALUES(route_path),
  api_method = VALUES(api_method),
  api_path = VALUES(api_path),
  sort_order = VALUES(sort_order),
  status = 1,
  deleted_at = NULL;
