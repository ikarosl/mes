SET @demo_actor_id = (SELECT id FROM users WHERE username = 'admin' AND deleted_at IS NULL LIMIT 1);

INSERT INTO product_categories (
  parent_id, category_code, category_name, item_kind, status, remark,
  created_by, updated_by, is_deleted, deleted_by, deleted_at
)
VALUES
  (NULL, 'mat-shell-001', '腔体', 'material', 1, NULL, @demo_actor_id, @demo_actor_id, 0, NULL, NULL),
  (NULL, 'mat-ferrite-001', '铁氧体', 'material', 1, NULL, @demo_actor_id, @demo_actor_id, 0, NULL, NULL),
  (NULL, 'product-microstrip-001', '微带', 'finished_product', 1, NULL, @demo_actor_id, @demo_actor_id, 0, NULL, NULL)
ON DUPLICATE KEY UPDATE
  parent_id = NULL,
  category_name = VALUES(category_name),
  item_kind = VALUES(item_kind),
  status = 1,
  remark = VALUES(remark),
  updated_by = @demo_actor_id,
  is_deleted = 0,
  deleted_by = NULL,
  deleted_at = NULL;

SET @category_shell_id = (SELECT id FROM product_categories WHERE category_code = 'mat-shell-001');
SET @category_ferrite_id = (SELECT id FROM product_categories WHERE category_code = 'mat-ferrite-001');
SET @category_microstrip_id = (SELECT id FROM product_categories WHERE category_code = 'product-microstrip-001');

INSERT INTO products (
  item_code, product_name, category_id, default_route_id, unit, acquire_method,
  spec_values, status, remark, created_by, updated_by, is_deleted, deleted_by, deleted_at
)
VALUES
  ('p-micro-20-30', '微带20-30', @category_microstrip_id, NULL, 'pcs', 'self_made',
   JSON_ARRAY(JSON_OBJECT('key', 'insert_loss', 'unit', 'db', 'value', '0.6')),
   1, NULL, @demo_actor_id, @demo_actor_id, 0, NULL, NULL),
  ('m-ferrite-20*20-circular', '20*20圆形铁氧体', @category_ferrite_id, NULL, 'pcs', 'purchased',
   JSON_ARRAY(), 1, NULL, @demo_actor_id, @demo_actor_id, 0, NULL, NULL),
  ('m-shell-25*25-square', '25*25腔体方形', @category_shell_id, NULL, 'pcs', 'purchased',
   JSON_ARRAY(), 1, NULL, @demo_actor_id, @demo_actor_id, 0, NULL, NULL)
ON DUPLICATE KEY UPDATE
  product_name = VALUES(product_name),
  category_id = VALUES(category_id),
  unit = VALUES(unit),
  acquire_method = VALUES(acquire_method),
  spec_values = VALUES(spec_values),
  status = 1,
  remark = VALUES(remark),
  updated_by = @demo_actor_id,
  is_deleted = 0,
  deleted_by = NULL,
  deleted_at = NULL;

SET @finished_product_id = (SELECT id FROM products WHERE item_code = 'p-micro-20-30');
SET @ferrite_id = (SELECT id FROM products WHERE item_code = 'm-ferrite-20*20-circular');
SET @shell_id = (SELECT id FROM products WHERE item_code = 'm-shell-25*25-square');

-- 物料基础编码是 BOM 身份；物料版本是管理员在需求、采购入库和补料时
-- 明确选择的精确库存身份。重复执行演示种子时只更新可变状态/备注，不改版本身份。
INSERT INTO material_variants (
  material_product_id, major_version, minor_version, variant_code, status, remark,
  created_by, updated_by, is_deleted, deleted_by, deleted_at
)
VALUES
  (@ferrite_id, 'V1', 'A', 'm-ferrite-20*20-circular-V1-A', 1, '演示启用版本 A', @demo_actor_id, @demo_actor_id, 0, NULL, NULL),
  (@ferrite_id, 'V1', 'B', 'm-ferrite-20*20-circular-V1-B', 1, '演示启用版本 B', @demo_actor_id, @demo_actor_id, 0, NULL, NULL),
  (@shell_id, 'V1', 'A', 'm-shell-25*25-square-V1-A', 1, '演示启用版本 A', @demo_actor_id, @demo_actor_id, 0, NULL, NULL)
ON DUPLICATE KEY UPDATE
  status = 1,
  remark = VALUES(remark),
  updated_by = @demo_actor_id,
  is_deleted = 0,
  deleted_by = NULL,
  deleted_at = NULL;

INSERT INTO product_materials (
  product_id, material_product_id, quantity_per_unit, unit, is_key_material,
  need_batch_record, status, remark, created_by, updated_by, is_deleted, deleted_by, deleted_at
)
VALUES
  (@finished_product_id, @ferrite_id, 1.0000, 'pcs', 1, 1, 1, NULL, @demo_actor_id, @demo_actor_id, 0, NULL, NULL),
  (@finished_product_id, @shell_id, 1.0000, 'pcs', 1, 1, 1, NULL, @demo_actor_id, @demo_actor_id, 0, NULL, NULL)
ON DUPLICATE KEY UPDATE
  quantity_per_unit = VALUES(quantity_per_unit),
  unit = VALUES(unit),
  is_key_material = VALUES(is_key_material),
  need_batch_record = VALUES(need_batch_record),
  status = 1,
  remark = VALUES(remark),
  updated_by = @demo_actor_id,
  is_deleted = 0,
  deleted_by = NULL,
  deleted_at = NULL;

INSERT INTO process_steps (
  step_code, step_name, description, default_sop_file_id, status, remark,
  created_by, updated_by, is_deleted, deleted_by, deleted_at
)
VALUES
  ('gx-001', '装配', NULL, NULL, 1, NULL, @demo_actor_id, @demo_actor_id, 0, NULL, NULL),
  ('gx-002', '粘接', NULL, NULL, 1, NULL, @demo_actor_id, @demo_actor_id, 0, NULL, NULL)
ON DUPLICATE KEY UPDATE
  step_name = VALUES(step_name),
  description = VALUES(description),
  status = 1,
  remark = VALUES(remark),
  updated_by = @demo_actor_id,
  is_deleted = 0,
  deleted_by = NULL,
  deleted_at = NULL;

INSERT INTO process_routes (
  route_code, route_name, product_id, version_no, status, remark,
  created_by, updated_by, is_deleted, deleted_by, deleted_at
)
VALUES (
  'r-001', '微带环形器工艺路线', @finished_product_id, 'V1.0', 'enabled', NULL,
  @demo_actor_id, @demo_actor_id, 0, NULL, NULL
)
ON DUPLICATE KEY UPDATE
  route_name = VALUES(route_name),
  status = 'enabled',
  remark = VALUES(remark),
  updated_by = @demo_actor_id,
  is_deleted = 0,
  deleted_by = NULL,
  deleted_at = NULL;

SET @route_id = (
  SELECT id FROM process_routes
  WHERE product_id = @finished_product_id AND route_code = 'r-001' AND version_no = 'V1.0'
);
SET @assembly_step_id = (SELECT id FROM process_steps WHERE step_code = 'gx-001');
SET @bonding_step_id = (SELECT id FROM process_steps WHERE step_code = 'gx-002');
SET @operator_001_id = (SELECT id FROM users WHERE username = 'operator-001');
SET @operator_002_id = (SELECT id FROM users WHERE username = 'operator-002');

INSERT INTO process_route_steps (
  route_id, process_step_id, step_order, step_code_snapshot, step_name_snapshot,
  description_snapshot, default_owner_id, sop_file_id, sop_file_name_snapshot,
  sop_object_key_snapshot, sop_version_no_snapshot, need_inspection, need_record,
  status, remark, created_by, updated_by, is_deleted, deleted_by, deleted_at
)
VALUES
  (@route_id, @assembly_step_id, 1, 'gx-001', '装配', NULL, @operator_002_id,
   NULL, NULL, NULL, NULL, 0, 1, 1, NULL, @demo_actor_id, @demo_actor_id, 0, NULL, NULL),
  (@route_id, @bonding_step_id, 2, 'gx-002', '粘接', NULL, @operator_001_id,
   NULL, NULL, NULL, NULL, 0, 1, 1, NULL, @demo_actor_id, @demo_actor_id, 0, NULL, NULL)
ON DUPLICATE KEY UPDATE
  process_step_id = VALUES(process_step_id),
  step_code_snapshot = VALUES(step_code_snapshot),
  step_name_snapshot = VALUES(step_name_snapshot),
  description_snapshot = VALUES(description_snapshot),
  default_owner_id = VALUES(default_owner_id),
  sop_file_id = NULL,
  sop_file_name_snapshot = NULL,
  sop_object_key_snapshot = NULL,
  sop_version_no_snapshot = NULL,
  need_inspection = 0,
  need_record = 1,
  status = 1,
  remark = NULL,
  updated_by = @demo_actor_id,
  is_deleted = 0,
  deleted_by = NULL,
  deleted_at = NULL;

UPDATE products
SET default_route_id = @route_id, updated_by = @demo_actor_id
WHERE id = @finished_product_id;
