INSERT INTO permissions (parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
SELECT id, '查看技术文件', 'product:files:view', 'api', NULL, 'GET', '/api/product/technical-files', 150, 1 FROM permissions WHERE code='product:view'
UNION ALL SELECT id, '上传技术文件', 'product:files:upload', 'api', NULL, 'POST', '/api/product/technical-files', 151, 1 FROM permissions WHERE code='product:view'
UNION ALL SELECT id, '下载技术文件', 'product:files:download', 'api', NULL, 'GET', '/api/product/technical-files/:id/content', 152, 1 FROM permissions WHERE code='product:view'
UNION ALL SELECT id, '删除技术文件', 'product:files:delete', 'api', NULL, 'DELETE', '/api/product/technical-files/:id', 153, 1 FROM permissions WHERE code='product:view'
UNION ALL SELECT id, '关联工序技术文件', 'product:files:attach', 'api', NULL, 'PATCH', '/api/product/process-steps/:id/default-sop', 154, 1 FROM permissions WHERE code='product:view'
ON DUPLICATE KEY UPDATE parent_id=VALUES(parent_id), name=VALUES(name), type=VALUES(type), route_path=VALUES(route_path), api_method=VALUES(api_method), api_path=VALUES(api_path), sort_order=VALUES(sort_order), status=1, deleted_at=NULL;
