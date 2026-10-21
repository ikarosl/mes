START TRANSACTION;

INSERT INTO permissions (
  parent_id, name, code, type, route_path, api_method, api_path, sort_order, status
)
SELECT id, '生产报工记录', 'production:execution-records:view', 'page',
  '/production/execution-records', NULL, NULL, 35, 1
FROM permissions
WHERE code = 'production:view'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name = VALUES(name),
  type = VALUES(type),
  route_path = VALUES(route_path),
  api_method = VALUES(api_method),
  api_path = VALUES(api_path),
  sort_order = VALUES(sort_order);

COMMIT;
