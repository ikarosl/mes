INSERT INTO permissions (name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('系统管理', 'system:view', 'menu', NULL, NULL, NULL, 20, 1)
ON DUPLICATE KEY UPDATE
  parent_id = NULL,
  name = VALUES(name),
  type = VALUES(type),
  route_path = VALUES(route_path),
  api_method = VALUES(api_method),
  api_path = VALUES(api_path),
  sort_order = VALUES(sort_order),
  status = VALUES(status),
  deleted_at = NULL;

UPDATE permissions AS child
JOIN permissions AS parent ON parent.code = 'system:view'
SET child.parent_id = parent.id
WHERE child.code LIKE 'system:%'
  AND child.code <> 'system:view';
