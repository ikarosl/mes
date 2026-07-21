INSERT INTO permissions (name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES
  ('首页', 'dashboard:view', 'page', '/', NULL, NULL, 10, 1),
  ('用户管理', 'system:user:view', 'page', '/system/users', 'GET', '/api/system/users', 20, 1),
  ('创建用户', 'system:user:create', 'api', NULL, 'POST', '/api/system/users', 21, 1),
  ('更新用户', 'system:user:update', 'api', NULL, 'PATCH', '/api/system/users/:id/status', 22, 1),
  ('分配用户角色', 'system:user:assign-roles', 'api', NULL, 'PUT', '/api/system/users/:id/roles', 23, 1),
  ('角色管理', 'system:role:view', 'page', '/system/roles', 'GET', '/api/system/roles', 30, 1),
  ('创建角色', 'system:role:create', 'api', NULL, 'POST', '/api/system/roles', 31, 1),
  ('更新角色', 'system:role:update', 'button', NULL, NULL, NULL, 32, 1),
  ('分配角色权限', 'system:role:assign-permissions', 'api', NULL, 'PUT', '/api/system/roles/:id/permissions', 33, 1),
  ('权限管理', 'system:permission:view', 'page', '/system/permissions', 'GET', '/api/system/permissions', 40, 1),
  ('操作日志', 'system:log:view', 'page', '/system/logs', 'GET', '/api/system/logs', 50, 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  type = VALUES(type),
  route_path = VALUES(route_path),
  api_method = VALUES(api_method),
  api_path = VALUES(api_path),
  sort_order = VALUES(sort_order),
  status = VALUES(status),
  deleted_at = NULL;
