-- Draft examples only: version choice requires an administrator's demand confirmation.
SET @demo_actor_id = (SELECT id FROM users WHERE username = 'admin' AND deleted_at IS NULL LIMIT 1);
INSERT INTO work_orders (
  work_order_no, order_type, product_id, product_code_snapshot, product_name_snapshot,
  unit_snapshot, planned_quantity, status, remark, created_by, updated_by
)
SELECT sample.work_order_no, sample.order_type, p.id, p.item_code, p.product_name,
  p.unit, sample.quantity, 'draft', sample.remark, @demo_actor_id, @demo_actor_id
FROM (
  SELECT 'demo-mass-001' work_order_no, 'mass_production' order_type, 100 quantity,
    '批量单：整个工单同一基础物料只允许一个版本，包含全部批次和补料' remark UNION ALL
  SELECT 'demo-research-001', 'research', 10,
    '研发单：从产品 BOM 选择基础物料，由管理员配置一个或多个启用版本'
) sample JOIN products p ON p.item_code = 'p-micro-20-30'
WHERE NOT EXISTS (SELECT 1 FROM work_orders wo WHERE wo.work_order_no = sample.work_order_no);
