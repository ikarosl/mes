-- Draft examples only: version choice requires an administrator's demand confirmation.
-- The demo runner wraps this file and numbering writes in the same transaction.
SET @demo_actor_id = (SELECT id FROM users WHERE username = 'admin' AND deleted_at IS NULL LIMIT 1);
SET @demo_number_date = DATE_FORMAT(UTC_TIMESTAMP(3) + INTERVAL 8 HOUR, '%Y-%m-%d');

CREATE TEMPORARY TABLE demo_work_order_candidates AS
SELECT sample.external_order_no, sample.order_type, sample.quantity, sample.remark,
  p.id product_id, p.item_code, p.product_name, p.unit
FROM (
  SELECT 'demo-mass-001' external_order_no, 'mass_production' order_type, 100 quantity,
    '批量单：整个工单同一基础物料只允许一个版本，包含全部批次和补料' remark UNION ALL
  SELECT 'demo-research-001', 'research', 10,
    '研发单：从产品 BOM 选择基础物料，由管理员配置一个或多个启用版本'
) sample JOIN products p ON p.item_code = 'p-micro-20-30'
WHERE NOT EXISTS (
  SELECT 1 FROM work_orders wo WHERE wo.external_order_no = sample.external_order_no
);

SET @demo_new_order_count = (SELECT COUNT(*) FROM demo_work_order_candidates);
INSERT INTO work_order_daily_sequence (number_date,last_sequence)
SELECT @demo_number_date,@demo_new_order_count WHERE @demo_new_order_count>0
ON DUPLICATE KEY UPDATE last_sequence=last_sequence+@demo_new_order_count;
SET @demo_sequence_start = (
  SELECT last_sequence-@demo_new_order_count FROM work_order_daily_sequence
  WHERE number_date=@demo_number_date
);

INSERT INTO work_orders (
  work_order_no, external_order_no, order_type, product_id, product_code_snapshot,
  product_name_snapshot, unit_snapshot, planned_quantity, plan_start_date,
  plan_end_date, status, remark, created_by, updated_by
)
SELECT CONCAT(@demo_number_date,'-',@demo_sequence_start+ROW_NUMBER() OVER (ORDER BY external_order_no)),
  external_order_no, order_type, product_id, item_code, product_name, unit, quantity,
  @demo_number_date, DATE_ADD(@demo_number_date,INTERVAL 7 DAY), 'draft', remark,
  @demo_actor_id, @demo_actor_id
FROM demo_work_order_candidates;

DROP TEMPORARY TABLE demo_work_order_candidates;
