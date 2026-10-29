-- UI acceptance data only: no business documents, batches or inventory facts are seeded.
INSERT INTO roles (name, code, description, status, deleted_at)
VALUES
  ('其他入库演示员', 'demo-other-inbound', '仅办理其他入库，用于核对整合入口及库存候选权限', 1, NULL),
  ('其他出库演示员', 'demo-other-outbound', '仅办理其他出库，用于核对整合入口及历史批次选择', 1, NULL)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), description = VALUES(description), status = 1, deleted_at = NULL;

INSERT INTO users (department_id, username, password_hash, display_name, email, mobile, status, deleted_at)
VALUES
  (NULL, 'other-inbound-001', @demo_password_hash, '其他入库演示员', NULL, NULL, 1, NULL),
  (NULL, 'other-outbound-001', @demo_password_hash, '其他出库演示员', NULL, NULL, 1, NULL)
ON DUPLICATE KEY UPDATE
  password_hash = VALUES(password_hash), display_name = VALUES(display_name), status = 1, deleted_at = NULL;

DELETE ur FROM user_roles ur JOIN users u ON u.id = ur.user_id
WHERE u.username IN ('other-inbound-001', 'other-outbound-001');
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u JOIN roles r ON r.code = CASE
  WHEN u.username = 'other-inbound-001' THEN 'demo-other-inbound' ELSE 'demo-other-outbound' END
WHERE u.username IN ('other-inbound-001', 'other-outbound-001');

DELETE rp FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
WHERE r.code IN ('demo-other-inbound', 'demo-other-outbound');
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON
  p.code = 'dashboard:view'
  OR (r.code = 'demo-other-inbound' AND p.code IN (
    'warehouse:other-inbounds:view',
    'warehouse:other-inbounds:create',
    'warehouse:other-inbounds:update',
    'warehouse:other-inbounds:confirm',
    'warehouse:other-inbounds:cancel'
  ))
  OR (r.code = 'demo-other-outbound' AND p.code IN (
    'warehouse:other-outbounds:view',
    'warehouse:other-outbounds:create',
    'warehouse:other-outbounds:update',
    'warehouse:other-outbounds:confirm',
    'warehouse:other-outbounds:cancel'
  ))
WHERE r.code IN ('demo-other-inbound', 'demo-other-outbound');

SET @other_stock_demo_actor = (SELECT id FROM users WHERE username = 'admin' AND deleted_at IS NULL LIMIT 1);
SET @other_stock_demo_material_category = (SELECT id FROM item_categories WHERE category_code = 'mat-microstrip-001');
SET @other_stock_demo_product_category = (SELECT id FROM item_categories WHERE category_code = 'product-microstrip-001');

INSERT INTO materials (material_code, material_name, category_id, unit, acquire_method, spec_values, status, created_by, updated_by)
SELECT sample.code, sample.name, @other_stock_demo_material_category, sample.unit, 'purchased', JSON_OBJECT('columns', JSON_ARRAY(), 'rows', JSON_ARRAY()), sample.status,
  @other_stock_demo_actor, @other_stock_demo_actor
FROM (
  SELECT 'demo-stock-multi' code, '库存演示连接线' name, '根' unit, 1 status UNION ALL
  SELECT 'demo-stock-meter', '库存演示连接线', '米', 1 UNION ALL
  SELECT 'demo-stock-disabled', '库存演示停用物料', '件', 0 UNION ALL
  SELECT 'demo-stock-no-version', '库存演示无启用版本物料', '件', 1
) sample
WHERE NOT EXISTS (SELECT 1 FROM materials m WHERE m.material_code = sample.code);

INSERT INTO material_variants (material_id, major_version, minor_version, variant_code, status, created_by, updated_by)
SELECT m.id, sample.major_version, sample.minor_version,
  CONCAT(m.material_code, '-', sample.major_version, '-', sample.minor_version), sample.status,
  @other_stock_demo_actor, @other_stock_demo_actor
FROM (
  SELECT 'demo-stock-multi' code, 'v1' major_version, 'A' minor_version, 1 status UNION ALL
  SELECT 'demo-stock-multi', 'v1', 'B', 1 UNION ALL
  SELECT 'demo-stock-multi', 'v0', 'A', 0 UNION ALL
  SELECT 'demo-stock-meter', 'v1', 'A', 1 UNION ALL
  SELECT 'demo-stock-disabled', 'v1', 'A', 1 UNION ALL
  SELECT 'demo-stock-no-version', 'v0', 'A', 0
) sample JOIN materials m ON m.material_code = sample.code
WHERE NOT EXISTS (
  SELECT 1 FROM material_variants v WHERE v.material_id = m.id
    AND v.major_version = sample.major_version AND v.minor_version = sample.minor_version
);

INSERT INTO products (item_code, product_name, category_id, unit, acquire_method, spec_values, status, created_by, updated_by)
SELECT sample.code, '库存演示控制组件', @other_stock_demo_product_category, '套', 'self_made', JSON_OBJECT('columns', JSON_ARRAY(), 'rows', JSON_ARRAY()), sample.status,
  @other_stock_demo_actor, @other_stock_demo_actor
FROM (SELECT 'demo-stock-product' code, 1 status UNION ALL SELECT 'demo-stock-product-disabled', 0) sample
WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.item_code = sample.code);
