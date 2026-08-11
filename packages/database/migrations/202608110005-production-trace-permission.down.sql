DELETE FROM role_permissions
WHERE permission_id = (
  SELECT id FROM permissions WHERE code = 'production:trace:view'
);

DELETE FROM permissions
WHERE code = 'production:trace:view';
