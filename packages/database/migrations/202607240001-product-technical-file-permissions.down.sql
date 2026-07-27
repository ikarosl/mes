DELETE FROM role_permissions
WHERE permission_id IN (
  SELECT id FROM permissions WHERE code IN (
    'product:files:view',
    'product:files:upload',
    'product:files:download',
    'product:files:delete',
    'product:files:attach'
  )
);

DELETE FROM permissions WHERE code IN (
  'product:files:view',
  'product:files:upload',
  'product:files:download',
  'product:files:delete',
  'product:files:attach'
);
