-- 实验仓库独立办理目录；移除已退役接口的权限，不自动授予现有角色。
START TRANSACTION;
DELETE FROM role_permissions
WHERE permission_id IN (
  SELECT id FROM permissions WHERE code IN (
    'warehouse:receipts:accept', 'warehouse:receipts:correct',
    'warehouse:receipts:return', 'quality:inbound-inspections:review'
  )
);
DELETE FROM permissions WHERE code IN (
  'warehouse:receipts:accept', 'warehouse:receipts:correct',
  'warehouse:receipts:return', 'quality:inbound-inspections:review'
);
UPDATE permissions SET name = '登记进料检验报告'
WHERE code = 'quality:inbound-inspections:inspect';
COMMIT;
