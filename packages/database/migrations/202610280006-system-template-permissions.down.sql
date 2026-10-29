START TRANSACTION;

DELETE rp
FROM role_permissions rp
JOIN permissions p ON p.id = rp.permission_id
WHERE p.code IN (
  'system:templates:view',
  'system:templates:create',
  'system:templates:update'
);

DELETE FROM permissions
WHERE code IN ('system:templates:create', 'system:templates:update');

DELETE FROM permissions
WHERE code = 'system:templates:view';

COMMIT;
