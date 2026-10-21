-- Permission directory only: deploy the matching API/admin version together.
-- All catalog metadata is embedded; no persistent staging or compatibility tables.
-- The wildcard * remains owned by system seed. Existing IDs are renamed when possible.
-- Removed grants are deliberately discarded; down does not reconstruct historical roles.
-- warehouse:outbound:view is independently inserted; no materials:view grants are copied.

SET @permission_catalog_alignment = JSON_ARRAY(
  JSON_ARRAY('dashboard:view', '首页', NULL, 'page', '/', 10, NULL, NULL),
  JSON_ARRAY('system:view', '系统管理', NULL, 'menu', NULL, 20, NULL, NULL),
  JSON_ARRAY('system:user:view', '用户管理', 'system:view', 'page', '/system/users', 10, NULL, NULL),
  JSON_ARRAY('system:user:create', '创建用户', 'system:user:view', 'api', NULL, 10, NULL, NULL),
  JSON_ARRAY('system:user:update', '更新用户', 'system:user:view', 'api', NULL, 20, NULL, NULL),
  JSON_ARRAY('system:user:reset-password', '重置用户密码', 'system:user:view', 'api', NULL, 30, NULL, NULL),
  JSON_ARRAY('system:user:assign-roles', '分配用户角色', 'system:user:view', 'api', NULL, 40, NULL, NULL),
  JSON_ARRAY('system:role:view', '角色管理', 'system:view', 'page', '/system/roles', 20, NULL, NULL),
  JSON_ARRAY('system:role:create', '创建角色', 'system:role:view', 'api', NULL, 10, NULL, NULL),
  JSON_ARRAY('system:role:update', '更新角色', 'system:role:view', 'button', NULL, 20, NULL, NULL),
  JSON_ARRAY('system:role:delete', '删除角色', 'system:role:view', 'api', NULL, 30, NULL, NULL),
  JSON_ARRAY('system:role:assign-permissions', '分配角色权限', 'system:role:view', 'api', NULL, 40, NULL, NULL),
  JSON_ARRAY('system:permission:view', '权限管理', 'system:view', 'page', '/system/permissions', 30, NULL, NULL),
  JSON_ARRAY('system:log:view', '操作日志', 'system:view', 'page', '/system/logs', 40, NULL, NULL),
  JSON_ARRAY('approval:view', '审批中心', NULL, 'page', '/approval/inbox', 50, NULL, NULL),
  JSON_ARRAY('approval:configure', '审批流程配置', 'approval:view', 'page', '/approval/flows', 10, NULL, NULL),
  JSON_ARRAY('approval:decide', '处理审批', 'approval:view', 'api', NULL, 20, NULL, NULL),
  JSON_ARRAY('product:view', '产品资料', NULL, 'menu', NULL, 100, NULL, NULL),
  JSON_ARRAY('product:products:view', '成品与物料', 'product:view', 'page', '/product/products', 10, NULL, NULL),
  JSON_ARRAY('product:products:create', '新增成品', 'product:products:view', 'api', NULL, 10, NULL, NULL),
  JSON_ARRAY('product:products:update', '编辑成品', 'product:products:view', 'api', NULL, 20, NULL, NULL),
  JSON_ARRAY('product:products:change-status', '变更成品状态', 'product:products:view', 'api', NULL, 30, NULL, NULL),
  JSON_ARRAY('product:products:manage-bom', '维护成品 BOM', 'product:products:view', 'api', NULL, 40, NULL, NULL),
  JSON_ARRAY('product:products:set-default-route', '设置成品默认路线', 'product:products:view', 'api', NULL, 50, NULL, NULL),
  JSON_ARRAY('product:materials:view', '查看基础物料', 'product:products:view', 'api', NULL, 60, NULL, NULL),
  JSON_ARRAY('product:materials:create', '新增基础物料', 'product:products:view', 'api', NULL, 70, NULL, NULL),
  JSON_ARRAY('product:materials:update', '编辑基础物料', 'product:products:view', 'api', NULL, 80, NULL, NULL),
  JSON_ARRAY('product:materials:change-status', '变更基础物料状态', 'product:products:view', 'api', NULL, 90, NULL, NULL),
  JSON_ARRAY('product:material-variants:view', '查看物料版本', 'product:products:view', 'api', NULL, 100, NULL, NULL),
  JSON_ARRAY('product:material-variants:create', '新增物料版本', 'product:products:view', 'api', NULL, 110, NULL, NULL),
  JSON_ARRAY('product:material-variants:change-status', '变更物料版本状态', 'product:products:view', 'api', NULL, 120, NULL, NULL),
  JSON_ARRAY('product:files:view', '查看技术文件', 'product:products:view', 'api', NULL, 130, NULL, NULL),
  JSON_ARRAY('product:files:upload', '上传技术文件', 'product:products:view', 'api', NULL, 140, NULL, NULL),
  JSON_ARRAY('product:files:download', '下载技术文件', 'product:products:view', 'api', NULL, 150, NULL, NULL),
  JSON_ARRAY('product:files:attach', '关联工序技术文件', 'product:products:view', 'api', NULL, 160, NULL, NULL),
  JSON_ARRAY('product:categories:view', '分类配置', 'product:view', 'page', '/product/categories', 20, NULL, NULL),
  JSON_ARRAY('product:categories:create', '新增分类', 'product:categories:view', 'api', NULL, 10, NULL, NULL),
  JSON_ARRAY('product:categories:update', '编辑分类', 'product:categories:view', 'api', NULL, 20, NULL, NULL),
  JSON_ARRAY('product:categories:change-status', '变更分类状态', 'product:categories:view', 'api', NULL, 30, NULL, NULL),
  JSON_ARRAY('product:processes:view', '工序管理', 'product:view', 'page', '/product/processes', 30, NULL, NULL),
  JSON_ARRAY('product:processes:create', '新增工序', 'product:processes:view', 'api', NULL, 10, NULL, NULL),
  JSON_ARRAY('product:processes:update', '编辑工序', 'product:processes:view', 'api', NULL, 20, NULL, NULL),
  JSON_ARRAY('product:processes:change-status', '变更工序状态', 'product:processes:view', 'api', NULL, 30, NULL, NULL),
  JSON_ARRAY('product:processes:upload-sop', '上传工序 SOP', 'product:processes:view', 'api', NULL, 40, NULL, NULL),
  JSON_ARRAY('product:routes:view', '工艺路线', 'product:view', 'page', '/product/process-routes', 40, NULL, NULL),
  JSON_ARRAY('product:routes:create', '新增路线', 'product:routes:view', 'api', NULL, 10, NULL, NULL),
  JSON_ARRAY('product:routes:update', '编辑路线', 'product:routes:view', 'api', NULL, 20, NULL, NULL),
  JSON_ARRAY('product:routes:change-status', '变更路线状态', 'product:routes:view', 'api', NULL, 30, NULL, NULL),
  JSON_ARRAY('product:routes:manage-steps', '维护路线步骤', 'product:routes:view', 'api', NULL, 40, NULL, NULL),
  JSON_ARRAY('product:routes:delete', '删除草稿路线', 'product:routes:view', 'api', NULL, 50, NULL, NULL),
  JSON_ARRAY('production:view', '生产管理', NULL, 'menu', NULL, 200, NULL, NULL),
  JSON_ARRAY('production:orders:view', '工单管理', 'production:view', 'page', '/production/orders', 10, NULL, NULL),
  JSON_ARRAY('production:orders:create', '创建工单', 'production:orders:view', 'api', NULL, 10, NULL, NULL),
  JSON_ARRAY('production:orders:update', '编辑工单', 'production:orders:view', 'api', NULL, 20, NULL, NULL),
  JSON_ARRAY('production:orders:transition', '办理工单状态', 'production:orders:view', 'api', NULL, 30, NULL, NULL),
  JSON_ARRAY('production:tasks:view', '生产任务', 'production:view', 'page', '/production/tasks', 20, NULL, NULL),
  JSON_ARRAY('production:batches:create', '创建生产任务', 'production:tasks:view', 'api', NULL, 10, NULL, NULL),
  JSON_ARRAY('production:batches:update', '编辑生产任务', 'production:tasks:view', 'api', NULL, 20, NULL, NULL),
  JSON_ARRAY('production:batches:transition', '办理任务开工与状态', 'production:tasks:view', 'api', NULL, 30, NULL, NULL),
  JSON_ARRAY('production:tasks:terminate', '结束任务并登记产出', 'production:tasks:view', 'api', NULL, 40, NULL, NULL),
  JSON_ARRAY('production:tasks:manage-output', '维护产出清单与结案', 'production:tasks:view', 'api', NULL, 50, NULL, NULL),
  JSON_ARRAY('production:materials:view', '查看任务用料', 'production:tasks:view', 'api', NULL, 60, NULL, NULL),
  JSON_ARRAY('production:materials:allocate', '分配任务用料', 'production:tasks:view', 'api', NULL, 70, NULL, NULL),
  JSON_ARRAY('production:materials:correct-demand', '申请需求更正与关闭', 'production:tasks:view', 'api', NULL, 80, NULL, NULL),
  JSON_ARRAY('production:material-demands:view', '查看物料需求', 'production:tasks:view', 'api', NULL, 90, NULL, NULL),
  JSON_ARRAY('production:material-demands:configure', '配置版本需求', 'production:tasks:view', 'api', NULL, 100, NULL, NULL),
  JSON_ARRAY('production:material-demands:add-manual', '人工追加需求', 'production:tasks:view', 'api', NULL, 110, NULL, NULL),
  JSON_ARRAY('production:steps:manage-execution', '工序执行与报工管理', 'production:tasks:view', 'api', NULL, 120, NULL, NULL),
  JSON_ARRAY('production:steps:manage-abnormal', '审核工序异常', 'production:tasks:view', 'api', NULL, 130, NULL, NULL),
  JSON_ARRAY('production:steps:assign', '生产工序派工', 'production:tasks:view', 'api', NULL, 140, NULL, NULL),
  JSON_ARRAY('production:rework:execute', '执行生产返工', 'production:tasks:view', 'api', NULL, 150, NULL, NULL),
  JSON_ARRAY('production:worker-tasks:view', '我的工序', 'production:view', 'page', '/production/worker-tasks', 30, NULL, NULL),
  JSON_ARRAY('production:steps:start', '本人负责工序开始、完成与重开', 'production:worker-tasks:view', 'api', NULL, 10, NULL, NULL),
  JSON_ARRAY('production:steps:report', '工序报工', 'production:worker-tasks:view', 'api', NULL, 20, NULL, NULL),
  JSON_ARRAY('production:trace:view', '生产追溯', 'production:view', 'page', '/production/trace', 40, NULL, NULL),
  JSON_ARRAY('procurement:view', '采购管理', NULL, 'menu', NULL, 300, NULL, NULL),
  JSON_ARRAY('procurement:suppliers:view', '供应商配置', 'procurement:view', 'page', '/procurement/suppliers', 10, NULL, NULL),
  JSON_ARRAY('procurement:suppliers:create', '新增供应商', 'procurement:suppliers:view', 'button', NULL, 10, NULL, NULL),
  JSON_ARRAY('procurement:suppliers:update', '修改供应商', 'procurement:suppliers:view', 'button', NULL, 20, NULL, NULL),
  JSON_ARRAY('procurement:orders:view', '采购单', 'procurement:view', 'page', '/procurement/purchase-orders', 20, NULL, NULL),
  JSON_ARRAY('procurement:orders:create', '新增采购单', 'procurement:orders:view', 'button', NULL, 10, NULL, NULL),
  JSON_ARRAY('procurement:orders:update', '修改采购草稿', 'procurement:orders:view', 'button', NULL, 20, NULL, NULL),
  JSON_ARRAY('procurement:orders:place', '确认下单', 'procurement:orders:view', 'button', NULL, 30, NULL, NULL),
  JSON_ARRAY('procurement:orders:cancel', '取消采购单', 'procurement:orders:view', 'button', NULL, 40, NULL, NULL),
  JSON_ARRAY('procurement:orders:close', '关闭采购行', 'procurement:orders:view', 'button', NULL, 50, NULL, NULL),
  JSON_ARRAY('quality:view', '质量管理', NULL, 'menu', NULL, 350, NULL, NULL),
  JSON_ARRAY('quality:inbound-inspections:view', '来料检验', 'quality:view', 'page', '/quality/inbound-inspections', 10, NULL, NULL),
  JSON_ARRAY('quality:inbound-inspections:review', '发起来料复核', 'quality:inbound-inspections:view', 'button', NULL, 10, NULL, NULL),
  JSON_ARRAY('quality:inbound-inspections:inspect', '完成来料检验', 'quality:inbound-inspections:view', 'button', NULL, 20, NULL, NULL),
  JSON_ARRAY('quality:finished-inspections:view', '成品质检', 'quality:view', 'page', '/quality/finished-inspections', 20, NULL, NULL),
  JSON_ARRAY('quality:finished-inspections:record', '登记成品质检', 'quality:finished-inspections:view', 'button', NULL, 10, NULL, NULL),
  JSON_ARRAY('warehouse:view', '仓储管理', NULL, 'menu', NULL, 400, NULL, NULL),
  JSON_ARRAY('warehouse:inventory:view', '库存查询', 'warehouse:view', 'page', '/warehouse/inventory', 10, NULL, NULL),
  JSON_ARRAY('warehouse:receipts:view', '采购到货', 'warehouse:view', 'page', '/procurement/receipts', 20, NULL, NULL),
  JSON_ARRAY('warehouse:receipts:confirm', '登记采购到货', 'warehouse:receipts:view', 'button', NULL, 10, NULL, NULL),
  JSON_ARRAY('warehouse:receipts:accept', '核对并确认来料清单', 'warehouse:receipts:view', 'button', NULL, 20, NULL, NULL),
  JSON_ARRAY('warehouse:receipts:correct', '更正采购实收', 'warehouse:receipts:view', 'button', NULL, 30, NULL, NULL),
  JSON_ARRAY('warehouse:receipts:return', '退回供应商', 'warehouse:receipts:view', 'button', NULL, 40, NULL, NULL),
  JSON_ARRAY('warehouse:inbound:view', '入库管理', 'warehouse:view', 'page', '/warehouse/inbound-orders', 30, NULL, NULL),
  JSON_ARRAY('warehouse:inbound:confirm-purchase', '确认外购物料入库', 'warehouse:inbound:view', 'api', NULL, 10, NULL, NULL),
  JSON_ARRAY('warehouse:inbound:confirm-finished', '确认成品入库', 'warehouse:inbound:view', 'api', NULL, 20, NULL, NULL),
  JSON_ARRAY('warehouse:other-inbounds:view', '其他入库', 'warehouse:view', 'page', '/warehouse/inbound-orders/other', 40, NULL, NULL),
  JSON_ARRAY('warehouse:other-inbounds:create', '创建其他入库', 'warehouse:other-inbounds:view', 'api', NULL, 10, NULL, NULL),
  JSON_ARRAY('warehouse:other-inbounds:update', '编辑其他入库', 'warehouse:other-inbounds:view', 'api', NULL, 20, NULL, NULL),
  JSON_ARRAY('warehouse:other-inbounds:confirm', '确认其他入库', 'warehouse:other-inbounds:view', 'api', NULL, 30, NULL, NULL),
  JSON_ARRAY('warehouse:other-inbounds:cancel', '取消其他入库', 'warehouse:other-inbounds:view', 'api', NULL, 40, NULL, NULL),
  JSON_ARRAY('warehouse:outbound:view', '出库管理', 'warehouse:view', 'page', '/warehouse/outbound-orders', 50, NULL, NULL),
  JSON_ARRAY('warehouse:outbound:create', '创建生产领料单', 'warehouse:outbound:view', 'api', NULL, 10, NULL, NULL),
  JSON_ARRAY('warehouse:outbound:confirm', '确认生产领料出库', 'warehouse:outbound:view', 'api', NULL, 20, NULL, NULL),
  JSON_ARRAY('warehouse:outbound:cancel', '取消待确认领料单', 'warehouse:outbound:view', 'api', NULL, 30, NULL, NULL),
  JSON_ARRAY('warehouse:other-outbounds:view', '其他出库', 'warehouse:view', 'page', '/warehouse/outbound-orders/other', 60, NULL, NULL),
  JSON_ARRAY('warehouse:other-outbounds:create', '创建其他出库', 'warehouse:other-outbounds:view', 'api', NULL, 10, NULL, NULL),
  JSON_ARRAY('warehouse:other-outbounds:update', '编辑其他出库', 'warehouse:other-outbounds:view', 'api', NULL, 20, NULL, NULL),
  JSON_ARRAY('warehouse:other-outbounds:confirm', '确认其他出库', 'warehouse:other-outbounds:view', 'api', NULL, 30, NULL, NULL),
  JSON_ARRAY('warehouse:other-outbounds:cancel', '取消其他出库', 'warehouse:other-outbounds:view', 'api', NULL, 40, NULL, NULL),
  JSON_ARRAY('warehouse:returns:view', '退料管理', 'warehouse:view', 'page', '/warehouse/return-orders', 70, NULL, NULL),
  JSON_ARRAY('warehouse:returns:create', '创建退料单', 'warehouse:returns:view', 'api', NULL, 10, NULL, NULL),
  JSON_ARRAY('warehouse:returns:confirm', '确认退料入库', 'warehouse:returns:view', 'api', NULL, 20, NULL, NULL),
  JSON_ARRAY('warehouse:returns:cancel', '取消退料单', 'warehouse:returns:view', 'api', NULL, 30, NULL, NULL),
  JSON_ARRAY('warehouse:scraps:view', '领料损耗', 'warehouse:view', 'page', '/warehouse/scraps', 80, NULL, NULL),
  JSON_ARRAY('warehouse:scraps:create', '申报生产领料损耗', 'warehouse:scraps:view', 'api', NULL, 10, NULL, NULL),
  JSON_ARRAY('warehouse:scraps:confirm', '确认生产领料损耗', 'warehouse:scraps:view', 'api', NULL, 20, NULL, NULL),
  JSON_ARRAY('warehouse:scraps:cancel', '取消生产领料损耗', 'warehouse:scraps:view', 'api', NULL, 30, NULL, NULL),
  JSON_ARRAY('warehouse:stock-checks:view', '盘点管理', 'warehouse:view', 'page', '/warehouse/stock-checks', 90, NULL, NULL),
  JSON_ARRAY('warehouse:stock-checks:create', '创建盘点单', 'warehouse:stock-checks:view', 'api', NULL, 10, NULL, NULL),
  JSON_ARRAY('warehouse:stock-checks:count', '录入盘点数量', 'warehouse:stock-checks:view', 'api', NULL, 20, NULL, NULL),
  JSON_ARRAY('warehouse:stock-checks:complete', '完成库存盘点', 'warehouse:stock-checks:view', 'api', NULL, 30, NULL, NULL),
  JSON_ARRAY('warehouse:stock-checks:cancel', '取消库存盘点', 'warehouse:stock-checks:view', 'api', NULL, 40, NULL, NULL)
);

START TRANSACTION;

-- Detach owned nodes before pruning; all explicit parents are restored below.
UPDATE permissions SET parent_id=NULL WHERE code <> '*';

UPDATE permissions AS permission
LEFT JOIN permissions AS target ON target.code='warehouse:receipts:view'
SET permission.code='warehouse:receipts:view'
WHERE permission.code='procurement:receipts:view' AND target.id IS NULL;

UPDATE permissions AS permission
LEFT JOIN permissions AS target ON target.code='warehouse:receipts:confirm'
SET permission.code='warehouse:receipts:confirm'
WHERE permission.code='procurement:receipts:confirm' AND target.id IS NULL;

UPDATE permissions AS permission
LEFT JOIN permissions AS target ON target.code='warehouse:receipts:accept'
SET permission.code='warehouse:receipts:accept'
WHERE permission.code='procurement:receipts:accept' AND target.id IS NULL;

UPDATE permissions AS permission
LEFT JOIN permissions AS target ON target.code='warehouse:receipts:correct'
SET permission.code='warehouse:receipts:correct'
WHERE permission.code='procurement:receipts:correct' AND target.id IS NULL;

UPDATE permissions AS permission
LEFT JOIN permissions AS target ON target.code='warehouse:receipts:return'
SET permission.code='warehouse:receipts:return'
WHERE permission.code='procurement:receipts:return' AND target.id IS NULL;

UPDATE permissions AS permission
LEFT JOIN permissions AS target ON target.code='warehouse:inventory:view'
SET permission.code='warehouse:inventory:view'
WHERE permission.code='production:inventory:view' AND target.id IS NULL;

UPDATE permissions AS permission
LEFT JOIN permissions AS target ON target.code='warehouse:inbound:confirm-purchase'
SET permission.code='warehouse:inbound:confirm-purchase'
WHERE permission.code='production:inbounds:confirm' AND target.id IS NULL;

UPDATE permissions AS permission
LEFT JOIN permissions AS target ON target.code='warehouse:inbound:confirm-finished'
SET permission.code='warehouse:inbound:confirm-finished'
WHERE permission.code='production:inbounds:confirm-finished' AND target.id IS NULL;

UPDATE permissions AS permission
LEFT JOIN permissions AS target ON target.code='warehouse:outbound:create'
SET permission.code='warehouse:outbound:create'
WHERE permission.code='production:materials:outbound' AND target.id IS NULL;

UPDATE permissions AS permission
LEFT JOIN permissions AS target ON target.code='warehouse:outbound:confirm'
SET permission.code='warehouse:outbound:confirm'
WHERE permission.code='production:materials:outbound-confirm' AND target.id IS NULL;

UPDATE permissions AS permission
LEFT JOIN permissions AS target ON target.code='warehouse:outbound:cancel'
SET permission.code='warehouse:outbound:cancel'
WHERE permission.code='production:materials:outbound-cancel' AND target.id IS NULL;

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
