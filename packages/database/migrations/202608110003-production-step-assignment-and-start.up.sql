INSERT INTO permissions (parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
SELECT id, '生产工序派工', 'production:steps:assign', 'api', NULL, 'POST', '/api/production/batches/:batchId/step-records/:recordId/actions/*', 229, 1
FROM permissions WHERE code = 'production:view'
UNION ALL
SELECT id, '员工工序开工', 'production:steps:start', 'api', NULL, 'POST', '/api/production/batches/:batchId/step-records/:recordId/actions/start', 230, 1
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
