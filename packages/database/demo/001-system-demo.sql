-- Acceptance roles use explicit codes; page hierarchy never expands backend grants.
INSERT INTO roles (name, code, description, status, deleted_at)
VALUES
  ('生产操作工', 'operator', '演示：执行本人负责工序的开始、完成、重开与报工', 1, NULL),
  ('生产管理员', 'production', '演示：维护产品资料和生产任务；库存操作由仓管办理', 1, NULL),
  ('仓管', 'warehouse', '演示：采购到货、库存查询、出入库、退料、领料损耗与盘点', 1, NULL),
  ('采购员', 'procurement', '演示：维护供应商和采购单，不办理到货、质检或库存记账', 1, NULL),
  ('质检员', 'quality', '演示：来料检验与复核、成品质检和工序专检，不办理库存记账', 1, NULL)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  status = 1,
  deleted_at = NULL;

INSERT INTO users (
  department_id, username, password_hash, display_name, email, mobile, status, deleted_at
)
VALUES
  (NULL, 'operator-001', @demo_password_hash, '操作工-小王', NULL, NULL, 1, NULL),
  (NULL, 'operator-002', @demo_password_hash, '操作工-小李', NULL, NULL, 1, NULL),
  (NULL, 'production-001', @demo_password_hash, '生产管理员-Jason', NULL, NULL, 1, NULL),
  (NULL, 'warehouse-001', @demo_password_hash, '仓管-小周', NULL, NULL, 1, NULL),
  (NULL, 'procurement-001', @demo_password_hash, '采购员-小陈', NULL, NULL, 1, NULL),
  (NULL, 'quality-001', @demo_password_hash, '质检员-小赵', NULL, NULL, 1, NULL)
ON DUPLICATE KEY UPDATE
  department_id = NULL,
  password_hash = VALUES(password_hash),
  display_name = VALUES(display_name),
  email = NULL,
  mobile = NULL,
  status = 1,
  deleted_at = NULL;

DELETE ur
FROM user_roles ur
JOIN users u ON u.id = ur.user_id
WHERE u.username IN (
  'operator-001', 'operator-002', 'production-001',
  'warehouse-001', 'procurement-001', 'quality-001'
);

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u
JOIN (
  SELECT 'operator-001' username, 'operator' role_code UNION ALL
  SELECT 'operator-002', 'operator' UNION ALL
  SELECT 'production-001', 'production' UNION ALL
  SELECT 'warehouse-001', 'warehouse' UNION ALL
  SELECT 'procurement-001', 'procurement' UNION ALL
  SELECT 'quality-001', 'quality'
) assignment ON assignment.username = u.username
JOIN roles r ON r.code = assignment.role_code;

DELETE rp
FROM role_permissions rp
JOIN roles r ON r.id = rp.role_id
WHERE r.code IN ('operator', 'production', 'warehouse', 'procurement', 'quality');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'dashboard:view',
  'production:view',
  'production:worker-tasks:view',
  'production:steps:start',
  'production:steps:report'
)
WHERE r.code = 'operator';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'dashboard:view',
  'approval:view',
  'approval:decide',
  'warehouse:inventory:view',
  'product:view',
  'product:products:view',
  'product:products:create',
  'product:products:update',
  'product:products:change-status',
  'product:products:manage-bom',
  'product:materials:view',
  'product:materials:create',
  'product:materials:update',
  'product:materials:change-status',
  'product:material-variants:view',
  'product:material-variants:create',
  'product:material-variants:change-status',
  'product:files:view',
  'product:files:upload',
  'product:files:download',
  'product:files:attach',
  'product:categories:view',
  'product:categories:create',
  'product:categories:update',
  'product:categories:change-status',
  'product:processes:view',
  'product:processes:create',
  'product:processes:update',
  'product:processes:change-status',
  'product:processes:upload-sop',
  'product:routes:view',
  'product:routes:create',
  'product:routes:update',
  'product:routes:change-status',
  'product:routes:manage-steps',
  'product:routes:delete',
  'production:view',
  'production:orders:view',
  'production:orders:create',
  'production:orders:update',
  'production:orders:transition',
  'production:tasks:view',
  'production:execution-records:view',
  'production:batches:create',
  'production:batches:update',
  'production:batches:transition',
  'production:tasks:terminate',
  'production:tasks:manage-output',
  'production:materials:view',
  'production:materials:allocate',
  'production:materials:correct-demand',
  'production:material-demands:view',
  'production:material-demands:configure',
  'production:material-demands:add-manual',
  'production:steps:manage-execution',
  'production:steps:manage-abnormal',
  'quality:view',
  'quality:process-inspections:view',
  'production:steps:assign',
  'production:rework:execute',
  'production:worker-tasks:view',
  'production:steps:start',
  'production:steps:report',
  'production:trace:view'
)
WHERE r.code = 'production';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'dashboard:view',
  'warehouse:view',
  'warehouse:inventory:view',
  'warehouse:receipts:view',
  'warehouse:receipts:confirm',
  'warehouse:receipts:accept',
  'warehouse:receipts:correct',
  'warehouse:receipts:return',
  'warehouse:inbound:view',
  'warehouse:inbound:confirm-purchase',
  'warehouse:inbound:confirm-finished',
  'warehouse:other-inbounds:view',
  'warehouse:other-inbounds:create',
  'warehouse:other-inbounds:update',
  'warehouse:other-inbounds:confirm',
  'warehouse:other-inbounds:cancel',
  'warehouse:outbound:view',
  'warehouse:outbound:create',
  'warehouse:outbound:confirm',
  'warehouse:outbound:cancel',
  'warehouse:other-outbounds:view',
  'warehouse:other-outbounds:create',
  'warehouse:other-outbounds:update',
  'warehouse:other-outbounds:confirm',
  'warehouse:other-outbounds:cancel',
  'warehouse:returns:view',
  'warehouse:returns:create',
  'warehouse:returns:confirm',
  'warehouse:returns:cancel',
  'warehouse:scraps:view',
  'warehouse:scraps:create',
  'warehouse:scraps:confirm',
  'warehouse:scraps:cancel',
  'warehouse:stock-checks:view',
  'warehouse:stock-checks:create',
  'warehouse:stock-checks:count',
  'warehouse:stock-checks:complete',
  'warehouse:stock-checks:cancel'
)
WHERE r.code = 'warehouse';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'dashboard:view',
  'procurement:view',
  'procurement:suppliers:view',
  'procurement:suppliers:create',
  'procurement:suppliers:update',
  'procurement:orders:view',
  'procurement:orders:create',
  'procurement:orders:update',
  'procurement:orders:place',
  'procurement:orders:cancel',
  'procurement:orders:close'
)
WHERE r.code = 'procurement';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'dashboard:view',
  'quality:view',
  'quality:inbound-inspections:view',
  'quality:inbound-inspections:review',
  'quality:inbound-inspections:inspect',
  'quality:finished-inspections:view',
  'quality:finished-inspections:record',
  'quality:process-inspections:view',
  'quality:process-inspections:record'
)
WHERE r.code = 'quality';
