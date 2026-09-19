SET @demo_actor_id = (SELECT id FROM users WHERE username = 'admin' AND deleted_at IS NULL LIMIT 1);

INSERT INTO item_categories (parent_id, category_code, category_name, item_kind, status, created_by, updated_by)
SELECT NULL, 'mat-semi-001', '半成品', 'material', 1, @demo_actor_id, @demo_actor_id
WHERE NOT EXISTS (SELECT 1 FROM item_categories WHERE category_code = 'mat-semi-001');
SET @semi_category_id = (SELECT id FROM item_categories WHERE category_code = 'mat-semi-001');

INSERT INTO item_categories (parent_id, category_code, category_name, item_kind, status, created_by, updated_by)
SELECT @semi_category_id, 'mat-microstrip-001', '微带电路', 'material', 1, @demo_actor_id, @demo_actor_id
WHERE NOT EXISTS (SELECT 1 FROM item_categories WHERE category_code = 'mat-microstrip-001');
INSERT INTO item_categories (parent_id, category_code, category_name, item_kind, status, created_by, updated_by)
SELECT NULL, 'product-microstrip-001', '微带', 'finished_product', 1, @demo_actor_id, @demo_actor_id
WHERE NOT EXISTS (SELECT 1 FROM item_categories WHERE category_code = 'product-microstrip-001');
SET @material_category_id = (SELECT id FROM item_categories WHERE category_code = 'mat-microstrip-001');
SET @product_category_id = (SELECT id FROM item_categories WHERE category_code = 'product-microstrip-001');

-- Names are search/display values and intentionally repeat across different codes.
INSERT INTO products (item_code, product_name, category_id, unit, acquire_method, spec_values, status, created_by, updated_by)
SELECT sample.item_code, '微带20-30', @product_category_id, 'pcs', 'self_made', JSON_ARRAY(), 1, @demo_actor_id, @demo_actor_id
FROM (
  SELECT 'p-micro-20-30' item_code UNION ALL
  SELECT 'p-micro-20-30-02' UNION ALL SELECT 'p-micro-20-30-03'
) sample
WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.item_code = sample.item_code);

INSERT INTO materials (material_code, material_name, category_id, unit, acquire_method, spec_values, status, created_by, updated_by)
SELECT sample.material_code, '微带', @material_category_id, 'pcs', 'purchased', JSON_ARRAY(), 1, @demo_actor_id, @demo_actor_id
FROM (SELECT 'm1.077.012' material_code UNION ALL SELECT 'm1.077.013') sample
WHERE NOT EXISTS (SELECT 1 FROM materials m WHERE m.material_code = sample.material_code);

INSERT INTO material_variants (material_id, major_version, minor_version, variant_code, status, created_by, updated_by)
SELECT m.id, sample.major_version, sample.minor_version,
  CONCAT(m.material_code, '-', sample.major_version, '-', sample.minor_version), 1, @demo_actor_id, @demo_actor_id
FROM (
  SELECT 'm1.077.012' material_code, 'v1' major_version, 'A' minor_version UNION ALL
  SELECT 'm1.077.012', 'v1', 'B' UNION ALL
  SELECT 'm1.077.012', 'v2', 'A' UNION ALL
  SELECT 'm1.077.012', 'v2', 'B' UNION ALL
  SELECT 'm1.077.012', 'v2', 'C' UNION ALL
  SELECT 'm1.077.013', 'v1', 'A'
) sample JOIN materials m ON m.material_code = sample.material_code
WHERE NOT EXISTS (
  SELECT 1 FROM material_variants v WHERE v.material_id = m.id
    AND v.major_version = sample.major_version AND v.minor_version = sample.minor_version
);

-- Lock aggregate roots before BOM backfill; pending/approved evidence must not change.
SELECT id FROM products
WHERE item_code IN ('p-micro-20-30', 'p-micro-20-30-02', 'p-micro-20-30-03')
ORDER BY id FOR UPDATE;

UPDATE products p
JOIN (
  SELECT 'p-micro-20-30' item_code, 'm1.077.012' material_code UNION ALL
  SELECT 'p-micro-20-30-02', 'm1.077.012' UNION ALL
  SELECT 'p-micro-20-30-03', 'm1.077.013'
) sample ON sample.item_code=p.item_code
JOIN materials m ON m.material_code=sample.material_code
SET p.version=p.version+1,p.updated_by=@demo_actor_id
WHERE p.bom_status='draft' AND p.bom_locked_at IS NULL AND p.is_deleted=0
  AND NOT EXISTS (SELECT 1 FROM product_materials pm WHERE pm.product_id=p.id AND pm.material_id=m.id);

-- Seeded BOMs remain draft; no synthetic approval instances or decisions.
INSERT INTO product_materials (product_id, material_id, quantity_per_unit, unit, status, created_by, updated_by)
SELECT p.id, m.id, 1, m.unit, 1, @demo_actor_id, @demo_actor_id
FROM (
  SELECT 'p-micro-20-30' item_code, 'm1.077.012' material_code UNION ALL
  SELECT 'p-micro-20-30-02', 'm1.077.012' UNION ALL
  SELECT 'p-micro-20-30-03', 'm1.077.013'
) sample
JOIN products p ON p.item_code = sample.item_code
JOIN materials m ON m.material_code = sample.material_code
WHERE p.bom_status='draft' AND p.bom_locked_at IS NULL AND p.is_deleted=0 AND NOT EXISTS (
  SELECT 1 FROM product_materials pm WHERE pm.product_id = p.id AND pm.material_id = m.id
);

INSERT INTO process_steps (step_code, step_name, status, created_by, updated_by)
SELECT sample.step_code, sample.step_name, 1, @demo_actor_id, @demo_actor_id
FROM (SELECT 'gx-001' step_code, '装配' step_name UNION ALL SELECT 'gx-002', '粘接') sample
WHERE NOT EXISTS (SELECT 1 FROM process_steps ps WHERE ps.step_code = sample.step_code);

-- Routes have no applicable-product field or BOM relationship.
INSERT INTO process_routes (route_code, route_name, version_no, status, created_by, updated_by)
SELECT 'r-001', '微带环形器工艺路线', 'V1.0', 'draft', @demo_actor_id, @demo_actor_id
WHERE NOT EXISTS (SELECT 1 FROM process_routes WHERE route_code = 'r-001' AND version_no = 'V1.0');
SET @route_id = (SELECT id FROM process_routes WHERE route_code = 'r-001' AND version_no = 'V1.0');

INSERT INTO process_route_steps (
  route_id, process_step_id, step_order, step_code_snapshot, step_name_snapshot,
  default_owner_id, need_inspection, status, created_by, updated_by
)
SELECT @route_id, ps.id, sample.step_order, ps.step_code, ps.step_name,
  u.id, 0, 1, @demo_actor_id, @demo_actor_id
FROM (
  SELECT 'gx-001' step_code, 1 step_order, 'operator-002' username UNION ALL
  SELECT 'gx-002', 2, 'operator-001'
) sample JOIN process_steps ps ON ps.step_code = sample.step_code
JOIN users u ON u.username = sample.username
WHERE EXISTS (SELECT 1 FROM process_routes WHERE id = @route_id AND status = 'draft')
  AND NOT EXISTS (SELECT 1 FROM process_route_steps rs WHERE rs.route_id = @route_id AND rs.step_order = sample.step_order);

UPDATE process_routes SET status = 'enabled', updated_by = @demo_actor_id
WHERE id = @route_id AND status = 'draft'
  AND (SELECT COUNT(*) FROM process_route_steps WHERE route_id = @route_id AND status = 1 AND is_deleted = 0) = 2;

UPDATE products SET default_route_id = @route_id, version=version+1, updated_by = @demo_actor_id
WHERE item_code IN ('p-micro-20-30', 'p-micro-20-30-02', 'p-micro-20-30-03')
  AND default_route_id IS NULL AND bom_locked_at IS NULL AND bom_status='draft' AND is_deleted=0
  AND EXISTS (SELECT 1 FROM process_routes WHERE id = @route_id AND status = 'enabled' AND is_deleted = 0);
