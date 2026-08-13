DELETE FROM role_permissions
WHERE permission_id IN (
  SELECT id FROM permissions WHERE code IN ('production:steps:assign', 'production:steps:start')
);

DELETE FROM permissions
WHERE code IN ('production:steps:assign', 'production:steps:start');
