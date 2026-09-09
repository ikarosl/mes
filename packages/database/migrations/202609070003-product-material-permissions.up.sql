UPDATE permissions
SET name='查看物料版本', type='api', route_path=NULL,
    api_method='GET', api_path='/api/product/material-variants', sort_order=126
WHERE code='product:material-variants:view';

INSERT INTO permissions
  (parent_id,name,code,type,route_path,api_method,api_path,sort_order,status)
SELECT id,'查看基础物料','product:materials:view','api',NULL,'GET','/api/product/materials',116,1
FROM permissions WHERE code='product:view'
UNION ALL
SELECT id,'新增基础物料','product:materials:create','api',NULL,'POST','/api/product/materials',117,1
FROM permissions WHERE code='product:view'
UNION ALL
SELECT id,'编辑基础物料','product:materials:update','api',NULL,'PATCH','/api/product/materials/:id',118,1
FROM permissions WHERE code='product:view'
UNION ALL
SELECT id,'变更基础物料状态','product:materials:change-status','api',NULL,'PATCH','/api/product/materials/:id/status',119,1
FROM permissions WHERE code='product:view';

INSERT IGNORE INTO role_permissions (role_id,permission_id)
SELECT role.id,permission.id
FROM roles role
JOIN permissions permission ON permission.code IN (
  'product:materials:view',
  'product:materials:create',
  'product:materials:update',
  'product:materials:change-status'
)
WHERE role.code='admin' AND role.deleted_at IS NULL;
