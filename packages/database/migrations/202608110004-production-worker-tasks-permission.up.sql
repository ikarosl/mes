INSERT INTO permissions (parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
SELECT id, '我的工序', 'production:worker-tasks:view', 'page', '/production/worker-tasks', 'GET', '/api/production/worker-tasks', 231, 1
FROM permissions WHERE code = 'production:view'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name = VALUES(name),
  type = VALUES(type),
  route_path = VALUES(route_path),
  api_method = VALUES(api_method),
  api_path = VALUES(api_path),
  sort_order = VALUES(sort_order),
  status = 1,
  deleted_at = NULL;
