DELETE FROM permissions
WHERE code IN (
  'dashboard:view',
  'system:user:view',
  'system:user:create',
  'system:user:update',
  'system:user:assign-roles',
  'system:role:view',
  'system:role:create',
  'system:role:update',
  'system:role:assign-permissions',
  'system:permission:view',
  'system:log:view'
);
