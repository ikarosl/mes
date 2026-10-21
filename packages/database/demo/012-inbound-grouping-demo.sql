-- Master data for manual inbound grouping acceptance; source authorizations remain business commands.
SET @inbound_grouping_demo_actor = (
  SELECT id FROM users WHERE username = 'admin' AND deleted_at IS NULL LIMIT 1
);

INSERT INTO procurement_supplier (supplier_name, created_by, updated_by)
SELECT sample.supplier_name, @inbound_grouping_demo_actor, @inbound_grouping_demo_actor
FROM (
  SELECT '演示共批供应商甲' supplier_name UNION ALL
  SELECT '演示共批供应商乙'
) sample
WHERE NOT EXISTS (
  SELECT 1 FROM procurement_supplier s WHERE s.supplier_name = sample.supplier_name
);
