INSERT INTO permissions (name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES
  ('重置用户密码', 'system:user:reset-password', 'api', NULL, 'PATCH', '/api/system/users/:id/password', 23, 1),
  ('删除角色', 'system:role:delete', 'api', NULL, 'DELETE', '/api/system/roles/:id', 34, 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  type = VALUES(type),
  route_path = VALUES(route_path),
  api_method = VALUES(api_method),
  api_path = VALUES(api_path),
  sort_order = VALUES(sort_order),
  status = VALUES(status),
  deleted_at = NULL;
