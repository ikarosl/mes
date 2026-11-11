-- 仓库独立办理样例主数据；不在 seed 中伪造到货、报告或库存事实。
SET @warehouse_demo_actor = (SELECT id FROM users WHERE username = 'admin' AND deleted_at IS NULL LIMIT 1);
INSERT INTO item_categories (parent_id, category_code, category_name, item_kind, status, created_by, updated_by)
SELECT NULL, 'demo-warehouse-parts', '仓库演示零件', 'material', 1, @warehouse_demo_actor, @warehouse_demo_actor
WHERE NOT EXISTS (SELECT 1 FROM item_categories WHERE category_code = 'demo-warehouse-parts');
SET @warehouse_demo_category = (SELECT id FROM item_categories WHERE category_code = 'demo-warehouse-parts');
INSERT INTO materials (material_code, material_name, category_id, unit, acquire_method, spec_values, status, created_by, updated_by)
SELECT 'demo-warehouse-chamber', '腔体（仓库简化演示）', @warehouse_demo_category, '个', 'purchased',
  JSON_OBJECT('columns', JSON_ARRAY(), 'rows', JSON_ARRAY()), 1, @warehouse_demo_actor, @warehouse_demo_actor
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE material_code = 'demo-warehouse-chamber');
INSERT INTO material_variants (material_id, major_version, minor_version, variant_code, status, created_by, updated_by)
SELECT m.id, 'v1', 'A', 'demo-warehouse-chamber-v1-A', 1, @warehouse_demo_actor, @warehouse_demo_actor
FROM materials m WHERE m.material_code = 'demo-warehouse-chamber'
  AND NOT EXISTS (SELECT 1 FROM material_variants v WHERE v.material_id = m.id AND v.major_version = 'v1' AND v.minor_version = 'A');
