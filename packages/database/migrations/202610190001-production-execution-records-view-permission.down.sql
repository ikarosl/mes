START TRANSACTION;

DELETE rp
FROM role_permissions rp
JOIN permissions p ON p.id = rp.permission_id
WHERE p.code = 'production:execution-records:view';

DELETE FROM permissions
WHERE code = 'production:execution-records:view';

COMMIT;
