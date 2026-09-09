INSERT INTO roles (name, code, description, status, deleted_at)
VALUES
  ('生产操作工', 'operator', '演示：执行本人已派工工序的开工与报工', 1, NULL),
  ('生产管理员', 'production', '演示：维护产品资料并管理生产执行', 1, NULL)
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
  (NULL, 'production-001', @demo_password_hash, '生产管理员-Jason', NULL, NULL, 1, NULL)
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
WHERE u.username IN ('operator-001', 'operator-002', 'production-001');

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u
JOIN roles r ON r.code = CASE
  WHEN u.username IN ('operator-001', 'operator-002') THEN 'operator'
  ELSE 'production'
END
WHERE u.username IN ('operator-001', 'operator-002', 'production-001');

DELETE rp
FROM role_permissions rp
JOIN roles r ON r.id = rp.role_id
WHERE r.code IN ('operator', 'production');

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
JOIN permissions p ON
  p.code = 'dashboard:view'
  OR p.code LIKE 'product:%'
  OR p.code LIKE 'production:%'
WHERE r.code = 'production';
