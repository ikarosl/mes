DELETE rp
FROM role_permissions rp
JOIN permissions p ON p.id = rp.permission_id
WHERE p.code = 'production:steps:complete';

DELETE FROM permissions WHERE code = 'production:steps:complete';

