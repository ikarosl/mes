-- Permission directory only: deploy the matching API/admin version together.
-- All catalog metadata is embedded; no persistent staging or compatibility tables.
-- The wildcard * remains owned by system seed. Existing IDs are renamed when possible.
-- Removed grants are deliberately discarded; down does not reconstruct historical roles.
-- Restore the pre-alignment catalog, including obsolete codes, without inventing old grants.

SET @permission_catalog_alignment = JSON_ARRAY(
  JSON_ARRAY('dashboard:view', '首页', NULL, 'page', '/', 10, NULL, NULL),
  JSON_ARRAY('system:user:view', '用户管理', 'system:view', 'page', '/system/users', 20, 'GET', '/api/system/users'),
  JSON_ARRAY('system:user:create', '创建用户', 'system:view', 'api', NULL, 21, 'POST', '/api/system/users'),
  JSON_ARRAY('system:user:update', '更新用户', 'system:view', 'api', NULL, 22, 'PATCH', '/api/system/users/:id/status'),
  JSON_ARRAY('system:user:assign-roles', '分配用户角色', 'system:view', 'api', NULL, 23, 'PUT', '/api/system/users/:id/roles'),
  JSON_ARRAY('system:role:view', '角色管理', 'system:view', 'page', '/system/roles', 30, 'GET', '/api/system/roles'),
  JSON_ARRAY('system:role:create', '创建角色', 'system:view', 'api', NULL, 31, 'POST', '/api/system/roles'),
  JSON_ARRAY('system:role:update', '更新角色', 'system:view', 'button', NULL, 32, NULL, NULL),
  JSON_ARRAY('system:role:assign-permissions', '分配角色权限', 'system:view', 'api', NULL, 33, 'PUT', '/api/system/roles/:id/permissions'),
  JSON_ARRAY('system:permission:view', '权限管理', 'system:view', 'page', '/system/permissions', 40, 'GET', '/api/system/permissions'),
  JSON_ARRAY('system:log:view', '操作日志', 'system:view', 'page', '/system/logs', 50, 'GET', '/api/system/logs'),
  JSON_ARRAY('system:user:reset-password', '重置用户密码', 'system:view', 'api', NULL, 23, 'PATCH', '/api/system/users/:id/password'),
  JSON_ARRAY('system:role:delete', '删除角色', 'system:view', 'api', NULL, 34, 'DELETE', '/api/system/roles/:id'),
  JSON_ARRAY('product:view', '产品资料', NULL, 'menu', NULL, 100, NULL, NULL),
  JSON_ARRAY('product:products:view', '产品管理', 'product:view', 'page', '/product/products', 110, 'GET', '/api/product/products'),
  JSON_ARRAY('product:products:create', '新增产品', 'product:view', 'api', NULL, 111, 'POST', '/api/product/products'),
  JSON_ARRAY('product:products:update', '编辑产品', 'product:view', 'api', NULL, 112, 'PATCH', '/api/product/products/:id'),
  JSON_ARRAY('product:products:change-status', '变更产品状态', 'product:view', 'api', NULL, 113, 'PATCH', '/api/product/products/:id/status'),
  JSON_ARRAY('product:products:manage-bom', '维护产品BOM', 'product:view', 'api', NULL, 114, 'PUT', '/api/product/products/:id/materials'),
  JSON_ARRAY('product:products:set-default-route', '设置默认路线', 'product:view', 'api', NULL, 115, 'PATCH', '/api/product/products/:id/default-route'),
  JSON_ARRAY('product:categories:view', '产品分类', 'product:view', 'page', '/product/categories', 120, 'GET', '/api/product/categories'),
  JSON_ARRAY('product:categories:create', '新增分类', 'product:view', 'api', NULL, 121, 'POST', '/api/product/categories'),
  JSON_ARRAY('product:categories:update', '编辑分类', 'product:view', 'api', NULL, 122, 'PATCH', '/api/product/categories/:id'),
  JSON_ARRAY('product:categories:change-status', '变更分类状态', 'product:view', 'api', NULL, 123, 'PATCH', '/api/product/categories/:id/status'),
  JSON_ARRAY('product:processes:view', '工序管理', 'product:view', 'page', '/product/processes', 130, 'GET', '/api/product/process-steps'),
  JSON_ARRAY('product:processes:create', '新增工序', 'product:view', 'api', NULL, 131, 'POST', '/api/product/process-steps'),
  JSON_ARRAY('product:processes:update', '编辑工序', 'product:view', 'api', NULL, 132, 'PATCH', '/api/product/process-steps/:id'),
  JSON_ARRAY('product:processes:change-status', '变更工序状态', 'product:view', 'api', NULL, 133, 'PATCH', '/api/product/process-steps/:id/status'),
  JSON_ARRAY('product:processes:upload-sop', '上传工序SOP', 'product:view', 'api', NULL, 134, 'POST', '/api/product/process-steps/:id/sop'),
  JSON_ARRAY('product:routes:view', '工艺路线', 'product:view', 'page', '/product/process-routes', 140, 'GET', '/api/product/process-routes'),
  JSON_ARRAY('product:routes:create', '新增路线', 'product:view', 'api', NULL, 141, 'POST', '/api/product/process-routes'),
  JSON_ARRAY('product:routes:update', '编辑路线', 'product:view', 'api', NULL, 142, 'PATCH', '/api/product/process-routes/:id'),
  JSON_ARRAY('product:routes:change-status', '变更路线状态', 'product:view', 'api', NULL, 143, 'PATCH', '/api/product/process-routes/:id/status'),
  JSON_ARRAY('product:routes:manage-steps', '维护路线步骤', 'product:view', 'api', NULL, 144, 'PUT', '/api/product/process-routes/:id/steps'),
  JSON_ARRAY('product:routes:delete', '删除草稿路线', 'product:view', 'api', NULL, 145, 'DELETE', '/api/product/process-routes/:id'),
  JSON_ARRAY('product:files:view', '查看技术文件', 'product:view', 'api', NULL, 150, 'GET', '/api/product/technical-files'),
  JSON_ARRAY('product:files:upload', '上传技术文件', 'product:view', 'api', NULL, 151, 'POST', '/api/product/technical-files'),
  JSON_ARRAY('product:files:download', '下载技术文件', 'product:view', 'api', NULL, 152, 'GET', '/api/product/technical-files/:id/content'),
  JSON_ARRAY('product:files:delete', '删除技术文件', 'product:view', 'api', NULL, 153, 'DELETE', '/api/product/technical-files/:id'),
  JSON_ARRAY('product:files:attach', '关联工序技术文件', 'product:view', 'api', NULL, 154, 'PATCH', '/api/product/process-steps/:id/default-sop'),
  JSON_ARRAY('system:view', '系统管理', NULL, 'menu', NULL, 20, NULL, NULL),
  JSON_ARRAY('production:view', '生产管理', NULL, 'menu', NULL, 200, NULL, NULL),
  JSON_ARRAY('production:orders:view', '生产工单', 'production:view', 'page', '/production/orders', 210, 'GET', '/api/production/work-orders'),
  JSON_ARRAY('production:orders:create', '创建生产工单', 'production:view', 'api', NULL, 211, 'POST', '/api/production/work-orders'),
  JSON_ARRAY('production:orders:update', '编辑生产工单', 'production:view', 'api', NULL, 212, 'PATCH', '/api/production/work-orders/:id'),
  JSON_ARRAY('production:orders:transition', '变更生产工单状态', 'production:view', 'api', NULL, 213, 'POST', '/api/production/work-orders/:id/actions/*'),
  JSON_ARRAY('production:tasks:view', '生产批次与报工', 'production:view', 'page', '/production/tasks', 220, 'GET', '/api/production/batches'),
  JSON_ARRAY('production:batches:create', '创建生产批次', 'production:view', 'api', NULL, 221, 'POST', '/api/production/work-orders/:id/batches'),
  JSON_ARRAY('production:batches:update', '编辑生产批次', 'production:view', 'api', NULL, 222, 'PATCH', '/api/production/batches/:id'),
  JSON_ARRAY('production:batches:transition', '生产批次动作', 'production:view', 'api', NULL, 223, 'POST', '/api/production/batches/:id/actions/*'),
  JSON_ARRAY('production:steps:report', '工序报工', 'production:view', 'api', NULL, 225, 'POST', '/api/production/batches/:batchId/step-records/:recordId/reports'),
  JSON_ARRAY('production:steps:manage-execution', '工序执行与报工管理', 'production:view', 'api', NULL, 224, 'PATCH', '/api/production/batches/:batchId/step-records/:recordId/execution'),
  JSON_ARRAY('production:materials:view', '查看生产物料', 'production:view', 'api', NULL, 226, 'GET', '/api/production/batches/:batchId/material-demands'),
  JSON_ARRAY('production:materials:allocate', '分配生产物料', 'production:view', 'api', NULL, 227, 'POST', '/api/production/batches/:batchId/material-allocations*'),
  JSON_ARRAY('production:materials:outbound', '生产领料出库', 'production:view', 'api', NULL, 228, 'POST', '/api/production/batches/:batchId/material-outbounds'),
  JSON_ARRAY('production:steps:assign', '生产工序派工', 'production:view', 'api', NULL, 229, 'POST', '/api/production/batches/:batchId/step-records/:recordId/actions/*'),
  JSON_ARRAY('production:steps:start', '员工工序开始、完成与重开', 'production:view', 'api', NULL, 230, 'POST', '/api/production/batches/:batchId/step-records/:recordId/actions/*'),
  JSON_ARRAY('production:worker-tasks:view', '我的工序', 'production:view', 'page', '/production/worker-tasks', 231, 'GET', '/api/production/worker-tasks'),
  JSON_ARRAY('production:trace:view', '生产追溯', 'production:view', 'page', '/production/trace', 232, 'GET', '/api/production/trace*'),
  JSON_ARRAY('production:materials:outbound-confirm', '确认生产领料出库', 'production:view', 'api', NULL, 229, 'POST', '/api/production/material-outbounds/:outboundId/actions/confirm'),
  JSON_ARRAY('production:materials:outbound-cancel', '取消待确认领料单', 'production:view', 'api', NULL, 230, 'POST', '/api/production/material-outbounds/:outboundId/actions/cancel'),
  JSON_ARRAY('production:inventory:view', '查看物料库存', 'production:view', 'api', NULL, 231, 'GET', '/api/production/inventory-batches*'),
  JSON_ARRAY('warehouse:inbound:view', '入库管理', 'warehouse:view', 'page', '/warehouse/inbound-orders', 405, NULL, NULL),
  JSON_ARRAY('production:inbounds:create', '创建外购物料入库', 'production:view', 'api', NULL, 233, 'POST', '/api/production/purchase-inbounds'),
  JSON_ARRAY('production:inbounds:confirm', '确认外购物料入库', 'production:view', 'api', NULL, 234, 'POST', '/api/production/purchase-inbounds/:inboundId/actions/confirm'),
  JSON_ARRAY('production:inbounds:cancel', '取消待确认入库单', 'production:view', 'api', NULL, 235, 'POST', '/api/production/purchase-inbounds/:inboundId/actions/cancel'),
  JSON_ARRAY('production:steps:manage-abnormal', '审批生产异常', 'production:view', 'api', NULL, 233, 'POST', '/api/production/abnormal-dispositions/:dispositionId/actions/*'),
  JSON_ARRAY('production:rework:execute', '执行生产返工', 'production:view', 'api', NULL, 234, 'POST', '/api/production/reworks/:reworkId/actions/*'),
  JSON_ARRAY('warehouse:view', '仓储管理', NULL, 'menu', NULL, 400, NULL, NULL),
  JSON_ARRAY('warehouse:returns:view', '退料管理', 'warehouse:view', 'page', '/warehouse/return-orders', 410, NULL, NULL),
  JSON_ARRAY('warehouse:stock-checks:view', '盘点管理', 'warehouse:view', 'page', '/warehouse/stock-checks', 420, NULL, NULL),
  JSON_ARRAY('warehouse:returns:create', '创建退料单', 'warehouse:returns:view', 'api', NULL, 411, 'POST', '/api/warehouse/return-orders'),
  JSON_ARRAY('warehouse:returns:confirm', '确认退料入库', 'warehouse:returns:view', 'api', NULL, 412, 'POST', '/api/warehouse/return-orders/:returnId/actions/confirm'),
  JSON_ARRAY('warehouse:returns:cancel', '取消退料单', 'warehouse:returns:view', 'api', NULL, 413, 'POST', '/api/warehouse/return-orders/:returnId/actions/cancel'),
  JSON_ARRAY('warehouse:stock-checks:create', '创建盘点单', 'warehouse:stock-checks:view', 'api', NULL, 421, 'POST', '/api/warehouse/stock-checks'),
  JSON_ARRAY('warehouse:stock-checks:count', '录入盘点数量', 'warehouse:stock-checks:view', 'api', NULL, 422, 'PATCH', '/api/warehouse/stock-checks/:stockCheckId'),
  JSON_ARRAY('warehouse:stock-checks:complete', '完成库存盘点', 'warehouse:stock-checks:view', 'api', NULL, 423, 'POST', '/api/warehouse/stock-checks/:stockCheckId/actions/complete'),
  JSON_ARRAY('warehouse:stock-checks:cancel', '取消库存盘点', 'warehouse:stock-checks:view', 'api', NULL, 424, 'POST', '/api/warehouse/stock-checks/:stockCheckId/actions/cancel'),
  JSON_ARRAY('warehouse:scraps:view', '报废管理', 'warehouse:view', 'page', '/warehouse/scraps', 430, NULL, NULL),
  JSON_ARRAY('warehouse:scraps:create', '申报生产领料损耗', 'warehouse:scraps:view', 'api', NULL, 431, 'POST', '/api/warehouse/scraps'),
  JSON_ARRAY('warehouse:scraps:confirm', '确认生产领料损耗', 'warehouse:scraps:view', 'api', NULL, 432, 'POST', '/api/warehouse/scraps/:scrapId/actions/confirm'),
  JSON_ARRAY('warehouse:scraps:cancel', '取消生产领料损耗', 'warehouse:scraps:view', 'api', NULL, 433, 'POST', '/api/warehouse/scraps/:scrapId/actions/cancel'),
  JSON_ARRAY('product:material-variants:view', '查看物料版本', 'product:view', 'api', NULL, 126, 'GET', '/api/product/material-variants'),
  JSON_ARRAY('product:material-variants:create', '新增物料版本', 'product:view', 'api', NULL, 117, 'POST', '/api/product/material-variants'),
  JSON_ARRAY('product:material-variants:change-status', '变更物料版本状态', 'product:view', 'api', NULL, 118, 'PATCH', '/api/product/material-variants/:id/status'),
  JSON_ARRAY('production:material-demands:view', '查看物料需求', 'production:view', 'api', NULL, 233, 'GET', '/api/production/material-demands'),
  JSON_ARRAY('production:material-demands:configure', '配置版本需求', 'production:view', 'api', NULL, 234, 'POST', '/api/production/batches/:batchId/material-demands/configurations'),
  JSON_ARRAY('production:material-demands:add-manual', '人工追加需求', 'production:view', 'api', NULL, 235, 'POST', '/api/production/batches/:batchId/material-demands/additions'),
  JSON_ARRAY('product:materials:view', '查看基础物料', 'product:view', 'api', NULL, 116, 'GET', '/api/product/materials'),
  JSON_ARRAY('product:materials:create', '新增基础物料', 'product:view', 'api', NULL, 117, 'POST', '/api/product/materials'),
  JSON_ARRAY('product:materials:update', '编辑基础物料', 'product:view', 'api', NULL, 118, 'PATCH', '/api/product/materials/:id'),
  JSON_ARRAY('product:materials:change-status', '变更基础物料状态', 'product:view', 'api', NULL, 119, 'PATCH', '/api/product/materials/:id/status'),
  JSON_ARRAY('approval:view', '审批中心', NULL, 'page', '/approval/inbox', 50, 'GET', '/api/approval/instances'),
  JSON_ARRAY('approval:configure', '配置审批流程', 'approval:view', 'page', '/approval/flows', 51, 'PUT', '/api/approval/scenes/:sceneCode/flow/draft'),
  JSON_ARRAY('approval:decide', '处理审批', 'approval:view', 'api', NULL, 52, 'POST', '/api/approval/instances/:id/approve'),
  JSON_ARRAY('production:tasks:terminate', '结束批次并登记产出', 'production:tasks:view', 'api', NULL, 90, 'POST', '/api/production/batches/:batchId/actions/terminate'),
  JSON_ARRAY('production:materials:correct-demand', '申请需求更正与关闭', 'production:materials:view', 'api', NULL, 91, 'POST', '/api/production/material-demands/:demandId/corrections'),
  JSON_ARRAY('production:tasks:manage-output', '维护产出清单与结案审批', 'production:tasks:view', 'api', NULL, 91, 'POST', '/api/production/batches/:batchId/output/draft'),
  JSON_ARRAY('production:inbounds:confirm-finished', '确认成品入库', 'warehouse:inbound:view', 'api', NULL, 94, 'POST', '/api/production/finished-goods-inbounds/actions/confirm'),
  JSON_ARRAY('procurement:view', '采购管理', NULL, 'menu', '/procurement', 240, NULL, NULL),
  JSON_ARRAY('procurement:suppliers:view', '供应商配置', 'procurement:view', 'page', '/procurement/suppliers', 241, 'GET', '/api/procurement/suppliers*'),
  JSON_ARRAY('procurement:suppliers:create', '新增供应商', 'procurement:suppliers:view', 'button', NULL, 242, 'POST', '/api/procurement/suppliers'),
  JSON_ARRAY('procurement:suppliers:update', '修改供应商', 'procurement:suppliers:view', 'button', NULL, 243, 'PATCH', '/api/procurement/suppliers/:id'),
  JSON_ARRAY('procurement:orders:view', '采购订单', 'procurement:view', 'page', '/procurement/purchase-orders', 250, 'GET', '/api/procurement/purchase-orders*'),
  JSON_ARRAY('procurement:orders:create', '新增采购订单', 'procurement:orders:view', 'button', NULL, 251, 'POST', '/api/procurement/purchase-orders'),
  JSON_ARRAY('procurement:orders:update', '修改采购草稿', 'procurement:orders:view', 'button', NULL, 252, 'PATCH', '/api/procurement/purchase-orders/:id'),
  JSON_ARRAY('procurement:orders:place', '确认下单', 'procurement:orders:view', 'button', NULL, 253, 'POST', '/api/procurement/purchase-orders/:id/actions/place'),
  JSON_ARRAY('procurement:orders:cancel', '取消采购单', 'procurement:orders:view', 'button', NULL, 254, 'POST', '/api/procurement/purchase-orders/:id/actions/cancel'),
  JSON_ARRAY('procurement:orders:close', '结束采购行', 'procurement:orders:view', 'button', NULL, 255, 'POST', '/api/procurement/purchase-order-lines/:id/actions/close'),
  JSON_ARRAY('procurement:receipts:view', '到货管理', 'procurement:view', 'page', '/procurement/receipts', 260, 'GET', '/api/procurement/receipts*'),
  JSON_ARRAY('procurement:receipts:confirm', '确认到货', 'procurement:receipts:view', 'button', NULL, 261, 'POST', '/api/procurement/receipt*'),
  JSON_ARRAY('procurement:receipts:correct', '实收更正', 'procurement:receipts:view', 'button', NULL, 262, 'POST', '/api/procurement/receipt*'),
  JSON_ARRAY('procurement:receipts:return', '退回供应商', 'procurement:receipts:view', 'button', NULL, 263, 'POST', '/api/procurement/receipt*'),
  JSON_ARRAY('quality:inbound-inspections:view', '来料质检', NULL, 'page', '/quality/inbound-inspections', 270, 'GET', '/api/quality/inbound-inspections*'),
  JSON_ARRAY('quality:inbound-inspections:review', '发起来料复核', 'quality:inbound-inspections:view', 'button', NULL, 271, 'POST', '/api/procurement/receipt-lines/*'),
  JSON_ARRAY('quality:inbound-inspections:inspect', '完成来料检验', 'quality:inbound-inspections:view', 'button', NULL, 272, 'POST', '/api/procurement/receipt-lines/*'),
  JSON_ARRAY('quality:finished-inspections:view', '成品质检', NULL, 'page', '/quality/finished-inspections', 273, 'GET', '/api/quality/finished-inspections*'),
  JSON_ARRAY('quality:finished-inspections:record', '登记成品质检', 'quality:finished-inspections:view', 'button', NULL, 274, 'POST', '/api/quality/finished-inspections/*/actions/record'),
  JSON_ARRAY('procurement:receipts:accept', '核对并确认来料清单', 'procurement:receipts:view', 'button', NULL, 264, 'POST', '/api/procurement/receipt-lines/*/actions/accept'),
  JSON_ARRAY('warehouse:other-inbounds:view', '其他入库', 'warehouse:view', 'page', '/warehouse/other-inbounds', 440, NULL, NULL),
  JSON_ARRAY('warehouse:other-inbounds:create', '创建其他入库', 'warehouse:other-inbounds:view', 'api', NULL, 441, 'POST', '/api/warehouse/other-inbounds'),
  JSON_ARRAY('warehouse:other-inbounds:update', '编辑其他入库', 'warehouse:other-inbounds:view', 'api', NULL, 442, 'PATCH', '/api/warehouse/other-inbounds/:orderId'),
  JSON_ARRAY('warehouse:other-inbounds:confirm', '确认其他入库', 'warehouse:other-inbounds:view', 'api', NULL, 443, 'POST', '/api/warehouse/other-inbounds/:orderId/actions/confirm'),
  JSON_ARRAY('warehouse:other-inbounds:cancel', '取消其他入库', 'warehouse:other-inbounds:view', 'api', NULL, 444, 'POST', '/api/warehouse/other-inbounds/:orderId/actions/cancel'),
  JSON_ARRAY('warehouse:other-outbounds:view', '其他出库', 'warehouse:view', 'page', '/warehouse/other-outbounds', 450, NULL, NULL),
  JSON_ARRAY('warehouse:other-outbounds:create', '创建其他出库', 'warehouse:other-outbounds:view', 'api', NULL, 451, 'POST', '/api/warehouse/other-outbounds'),
  JSON_ARRAY('warehouse:other-outbounds:update', '编辑其他出库', 'warehouse:other-outbounds:view', 'api', NULL, 452, 'PATCH', '/api/warehouse/other-outbounds/:orderId'),
  JSON_ARRAY('warehouse:other-outbounds:confirm', '确认其他出库', 'warehouse:other-outbounds:view', 'api', NULL, 453, 'POST', '/api/warehouse/other-outbounds/:orderId/actions/confirm'),
  JSON_ARRAY('warehouse:other-outbounds:cancel', '取消其他出库', 'warehouse:other-outbounds:view', 'api', NULL, 454, 'POST', '/api/warehouse/other-outbounds/:orderId/actions/cancel')
);

START TRANSACTION;

-- Detach owned nodes before pruning; all explicit parents are restored below.
UPDATE permissions SET parent_id=NULL WHERE code <> '*';

UPDATE permissions AS permission
LEFT JOIN permissions AS target ON target.code='procurement:receipts:view'
SET permission.code='procurement:receipts:view'
WHERE permission.code='warehouse:receipts:view' AND target.id IS NULL;

UPDATE permissions AS permission
LEFT JOIN permissions AS target ON target.code='procurement:receipts:confirm'
SET permission.code='procurement:receipts:confirm'
WHERE permission.code='warehouse:receipts:confirm' AND target.id IS NULL;

UPDATE permissions AS permission
LEFT JOIN permissions AS target ON target.code='procurement:receipts:accept'
SET permission.code='procurement:receipts:accept'
WHERE permission.code='warehouse:receipts:accept' AND target.id IS NULL;

UPDATE permissions AS permission
LEFT JOIN permissions AS target ON target.code='procurement:receipts:correct'
SET permission.code='procurement:receipts:correct'
WHERE permission.code='warehouse:receipts:correct' AND target.id IS NULL;

UPDATE permissions AS permission
LEFT JOIN permissions AS target ON target.code='procurement:receipts:return'
SET permission.code='procurement:receipts:return'
WHERE permission.code='warehouse:receipts:return' AND target.id IS NULL;

UPDATE permissions AS permission
LEFT JOIN permissions AS target ON target.code='production:inventory:view'
SET permission.code='production:inventory:view'
WHERE permission.code='warehouse:inventory:view' AND target.id IS NULL;

UPDATE permissions AS permission
LEFT JOIN permissions AS target ON target.code='production:inbounds:confirm'
SET permission.code='production:inbounds:confirm'
WHERE permission.code='warehouse:inbound:confirm-purchase' AND target.id IS NULL;

UPDATE permissions AS permission
LEFT JOIN permissions AS target ON target.code='production:inbounds:confirm-finished'
SET permission.code='production:inbounds:confirm-finished'
WHERE permission.code='warehouse:inbound:confirm-finished' AND target.id IS NULL;

UPDATE permissions AS permission
LEFT JOIN permissions AS target ON target.code='production:materials:outbound'
SET permission.code='production:materials:outbound'
WHERE permission.code='warehouse:outbound:create' AND target.id IS NULL;

UPDATE permissions AS permission
LEFT JOIN permissions AS target ON target.code='production:materials:outbound-confirm'
SET permission.code='production:materials:outbound-confirm'
WHERE permission.code='warehouse:outbound:confirm' AND target.id IS NULL;

UPDATE permissions AS permission
LEFT JOIN permissions AS target ON target.code='production:materials:outbound-cancel'
SET permission.code='production:materials:outbound-cancel'
WHERE permission.code='warehouse:outbound:cancel' AND target.id IS NULL;

-- A simultaneous old/new pair keeps the target row; stale and unlisted codes are removed.
DELETE grant_row FROM role_permissions AS grant_row
JOIN permissions AS permission ON permission.id=grant_row.permission_id
LEFT JOIN JSON_TABLE(
  @permission_catalog_alignment, '$[*]' COLUMNS (
    code VARCHAR(128) PATH '$[0]'
  )
) AS catalog ON catalog.code COLLATE utf8mb4_0900_ai_ci=permission.code
WHERE permission.code <> '*' AND catalog.code IS NULL;

DELETE permission FROM permissions AS permission
LEFT JOIN JSON_TABLE(
  @permission_catalog_alignment, '$[*]' COLUMNS (
    code VARCHAR(128) PATH '$[0]'
  )
) AS catalog ON catalog.code COLLATE utf8mb4_0900_ai_ci=permission.code
WHERE permission.code <> '*' AND catalog.code IS NULL;

INSERT INTO permissions
  (name,code,type,route_path,api_method,api_path,sort_order,status)
SELECT catalog.name,catalog.code,catalog.type,catalog.route_path,
  catalog.api_method,catalog.api_path,catalog.sort_order,1
FROM JSON_TABLE(
  @permission_catalog_alignment, '$[*]' COLUMNS (
    code VARCHAR(128) PATH '$[0]',
    name VARCHAR(64) PATH '$[1]',
    type VARCHAR(32) PATH '$[3]',
    route_path VARCHAR(255) PATH '$[4]',
    sort_order INT PATH '$[5]',
    api_method VARCHAR(16) PATH '$[6]',
    api_path VARCHAR(255) PATH '$[7]'
  )
) AS catalog
WHERE TRUE
ON DUPLICATE KEY UPDATE
  name=VALUES(name),type=VALUES(type),route_path=VALUES(route_path),
  api_method=VALUES(api_method),api_path=VALUES(api_path),sort_order=VALUES(sort_order);

UPDATE permissions AS permission
JOIN JSON_TABLE(
  @permission_catalog_alignment, '$[*]' COLUMNS (
    code VARCHAR(128) PATH '$[0]',
    parent_code VARCHAR(128) PATH '$[2]'
  )
) AS catalog ON catalog.code COLLATE utf8mb4_0900_ai_ci=permission.code
LEFT JOIN permissions AS parent ON parent.code=catalog.parent_code COLLATE utf8mb4_0900_ai_ci
SET permission.parent_id=parent.id;

COMMIT;
SET @permission_catalog_alignment = NULL;
