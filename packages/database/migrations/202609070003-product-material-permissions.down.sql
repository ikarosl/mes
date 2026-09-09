DELETE role_permissions
FROM role_permissions
JOIN permissions ON permissions.id=role_permissions.permission_id
WHERE permissions.code IN (
  'product:materials:view',
  'product:materials:create',
  'product:materials:update',
  'product:materials:change-status'
);

DELETE FROM permissions WHERE code IN (
  'product:materials:view',
  'product:materials:create',
  'product:materials:update',
  'product:materials:change-status'
);

UPDATE permissions
SET name='物料版本', type='page', route_path='/product/material-variants',
    api_method='GET', api_path='/api/product/material-variants', sort_order=116
WHERE code='product:material-variants:view';
