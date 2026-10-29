UPDATE permissions
SET name = CASE code
  WHEN 'product:products:view' THEN '产品与物料'
  WHEN 'product:products:create' THEN '新增产品'
  WHEN 'product:products:update' THEN '编辑产品'
  WHEN 'product:products:change-status' THEN '变更产品状态'
  WHEN 'product:products:manage-bom' THEN '维护产品 BOM'
  WHEN 'product:products:set-default-route' THEN '设置产品默认路线'
END
WHERE code IN (
  'product:products:view',
  'product:products:create',
  'product:products:update',
  'product:products:change-status',
  'product:products:manage-bom',
  'product:products:set-default-route'
);
