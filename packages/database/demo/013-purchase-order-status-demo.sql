-- Procurement state samples only. No receipt, quality, allocation or inventory facts are fabricated.
-- Only missing remark markers are inserted; reruns preserve samples that retain their leading marker.
-- Unit-price inputs keep long digits and trailing zeros; totals use the exclusive quotation and 13% tax.
SET @purchase_status_demo_actor = (
  SELECT id FROM users WHERE username='admin' AND deleted_at IS NULL LIMIT 1
);
-- Derived text and session variables must match the business schema, independent of connection collation.
SET @purchase_status_demo_date = CONVERT(DATE_FORMAT(CURRENT_DATE(), '%Y-%m-%d') USING utf8mb4) COLLATE utf8mb4_0900_ai_ci;
SET @purchase_status_demo_prefix = CONVERT(@demo_purchase_order_prefix USING utf8mb4) COLLATE utf8mb4_0900_ai_ci;

CREATE TEMPORARY TABLE demo_purchase_status_lines AS
SELECT sample.line_no,m.id item_id,v.id material_variant_id,
  m.material_code item_code,v.variant_code,m.unit,sample.quantity,
  sample.tax_exclusive_amount,sample.tax_inclusive_amount,sample.total_amount
FROM (
  SELECT 1 line_no,
    _utf8mb4'demo-stock-multi-v1-A' COLLATE utf8mb4_0900_ai_ci variant_code,10 quantity,
    _utf8mb4'123456789012345678901234567890.00' COLLATE utf8mb4_0900_ai_ci tax_exclusive_amount,
    _utf8mb4'140000000000000000000000000000.0000' COLLATE utf8mb4_0900_ai_ci tax_inclusive_amount,
    _utf8mb4'1395061715839506171583950617157.00' COLLATE utf8mb4_0900_ai_ci total_amount UNION ALL
  SELECT 2,'demo-stock-multi-v1-B',15,NULL,NULL,NULL UNION ALL
  SELECT 3,'demo-stock-meter-v1-A',5,NULL,NULL,NULL
) sample JOIN material_variants v ON v.variant_code=sample.variant_code AND v.is_deleted=0 AND v.status=1
JOIN materials m ON m.id=v.material_id AND m.is_deleted=0 AND m.status=1 AND m.acquire_method='purchased'
JOIN item_categories c ON c.id=m.category_id AND c.is_deleted=0 AND c.status=1;

CREATE TEMPORARY TABLE demo_purchase_status_candidates AS
SELECT sample.marker,sample.status,sample.remark,supplier.id supplier_id,ROW_NUMBER() OVER(ORDER BY sample.marker) sequence_no
FROM (
  SELECT _utf8mb4'演示共批供应商甲' COLLATE utf8mb4_0900_ai_ci supplier_name,
    _utf8mb4'[demo-purchase-state-draft]' COLLATE utf8mb4_0900_ai_ci marker,
    _utf8mb4'draft' COLLATE utf8mb4_0900_ai_ci status,
    _utf8mb4'[demo-purchase-state-draft] 草稿取消验收：可直接整单取消，也可编辑后正式下单。' COLLATE utf8mb4_0900_ai_ci remark UNION ALL
  SELECT '演示共批供应商甲','[demo-purchase-state-ordered]','ordered',
    '[demo-purchase-state-ordered] 三行采购结束与恢复验收：逐行结束、整单结束、反复结束与恢复，核对状态及通用操作日志。' UNION ALL
  SELECT '演示共批供应商乙','[demo-purchase-state-cancel]','ordered',
    '[demo-purchase-state-cancel] 无到货采购取消验收：可先结束部分行，再整单取消，核对状态及通用操作日志。'
) sample JOIN procurement_supplier supplier ON supplier.supplier_name=sample.supplier_name AND supplier.is_deleted=0
WHERE (SELECT COUNT(*) FROM demo_purchase_status_lines)=3
  AND @purchase_status_demo_actor IS NOT NULL
  AND NOT EXISTS(SELECT 1 FROM procurement_order o WHERE o.remark LIKE CONCAT(sample.marker,'%'));

SET @purchase_status_demo_count = (SELECT COUNT(*) FROM demo_purchase_status_candidates);
INSERT INTO business_number_daily_sequence(number_kind,number_date,last_sequence)
SELECT 'purchase_order',@purchase_status_demo_date,@purchase_status_demo_count
WHERE @purchase_status_demo_count>0
ON DUPLICATE KEY UPDATE last_sequence=last_sequence+@purchase_status_demo_count;
SET @purchase_status_demo_sequence_start = (
  SELECT last_sequence-@purchase_status_demo_count FROM business_number_daily_sequence
  WHERE number_kind='purchase_order' AND number_date=@purchase_status_demo_date
);

INSERT INTO procurement_order(purchase_no,supplier_id,work_order_id,source_type,status,remark,ordered_by,ordered_at,created_by,updated_by,version)
SELECT CONCAT(@purchase_status_demo_prefix,REPLACE(@purchase_status_demo_date,'-',''),'-',@purchase_status_demo_sequence_start+sequence_no),
  supplier_id,NULL,'stock',status,remark,
  IF(status='ordered',@purchase_status_demo_actor,NULL),IF(status='ordered',NOW(),NULL),
  @purchase_status_demo_actor,@purchase_status_demo_actor,IF(status='ordered',1,0)
FROM demo_purchase_status_candidates;

INSERT INTO procurement_order_line(purchase_order_id,line_no,item_id,material_variant_id,
  item_code_snapshot,material_variant_code_snapshot,unit_snapshot,planned_quantity,tax_exclusive_amount,tax_inclusive_amount,tax_rate_percent,total_amount,total_amount_source,status,created_by,updated_by,version)
SELECT o.id,l.line_no,l.item_id,l.material_variant_id,l.item_code,l.variant_code,l.unit,l.quantity,
  l.tax_exclusive_amount,l.tax_inclusive_amount,13,l.total_amount,
  IF(l.total_amount IS NULL,NULL,'calculated'),
  IF(o.status='ordered','open','draft'),@purchase_status_demo_actor,@purchase_status_demo_actor,IF(o.status='ordered',1,0)
FROM demo_purchase_status_candidates sample JOIN procurement_order o ON o.purchase_no=
  CONCAT(@purchase_status_demo_prefix,REPLACE(@purchase_status_demo_date,'-',''),'-',@purchase_status_demo_sequence_start+sample.sequence_no)
CROSS JOIN demo_purchase_status_lines l;

DROP TEMPORARY TABLE demo_purchase_status_candidates;
DROP TEMPORARY TABLE demo_purchase_status_lines;
