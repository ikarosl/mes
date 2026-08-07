INSERT INTO roles (name, code, description, status)
VALUES ('系统管理员', 'admin', '系统内置管理员', 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  status = VALUES(status),
  deleted_at = NULL;

INSERT INTO permissions (parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES (NULL, '全部权限', '*', 'api', NULL, NULL, NULL, 0, 1)
ON DUPLICATE KEY UPDATE
  parent_id = NULL,
  name = VALUES(name),
  type = VALUES(type),
  route_path = NULL,
  api_method = NULL,
  api_path = NULL,
  sort_order = VALUES(sort_order),
  status = VALUES(status),
  deleted_at = NULL;

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM roles AS role
JOIN permissions AS permission ON permission.code = '*'
WHERE role.code = 'admin';
