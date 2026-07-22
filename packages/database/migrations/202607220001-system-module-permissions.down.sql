DELETE FROM permissions
WHERE code IN (
  'system:user:reset-password',
  'system:role:delete'
);
