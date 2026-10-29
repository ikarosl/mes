START TRANSACTION;

INSERT INTO permissions (
  parent_id, name, code, type, route_path, api_method, api_path, sort_order, status
)
SELECT id, '模板管理', 'system:templates:view', 'page',
  '/system/templates', NULL, NULL, 60, 1
FROM permissions
WHERE code = 'system:view'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name = VALUES(name),
  type = VALUES(type),
  route_path = VALUES(route_path),
  api_method = VALUES(api_method),
  api_path = VALUES(api_path),
  sort_order = VALUES(sort_order);

INSERT INTO permissions (
  parent_id, name, code, type, route_path, api_method, api_path, sort_order, status
)
SELECT id, '创建模板', 'system:templates:create', 'api',
  NULL, NULL, NULL, 10, 1
FROM permissions
WHERE code = 'system:templates:view'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name = VALUES(name),
  type = VALUES(type),
  route_path = VALUES(route_path),
  api_method = VALUES(api_method),
  api_path = VALUES(api_path),
  sort_order = VALUES(sort_order);

INSERT INTO permissions (
  parent_id, name, code, type, route_path, api_method, api_path, sort_order, status
)
SELECT id, '修改模板', 'system:templates:update', 'api',
  NULL, NULL, NULL, 20, 1
FROM permissions
WHERE code = 'system:templates:view'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name = VALUES(name),
  type = VALUES(type),
  route_path = VALUES(route_path),
  api_method = VALUES(api_method),
  api_path = VALUES(api_path),
  sort_order = VALUES(sort_order);

COMMIT;
