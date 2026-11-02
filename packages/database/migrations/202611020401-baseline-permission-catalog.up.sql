-- One-time 20261102 baseline: phase 4, identity.
-- Final schema reproduced from all 118 historical migrations; later changes are append-only.

-- Fixed release snapshot: no runtime constants imports, credentials, roles or grants.
-- Preserve legal historical IDs; insert parents before children for the self foreign key.
START TRANSACTION;

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('1', NULL, '首页', 'dashboard:view', 'page', '/', NULL, NULL, 10, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('14', NULL, '产品资料', 'product:view', 'menu', NULL, NULL, NULL, 100, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('53', NULL, '系统管理', 'system:view', 'menu', NULL, NULL, NULL, 20, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('54', NULL, '生产管理', 'production:view', 'menu', NULL, NULL, NULL, 200, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('93', NULL, '仓储管理', 'warehouse:view', 'menu', NULL, NULL, NULL, 400, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('124', NULL, '审批中心', 'approval:view', 'page', '/approval/inbox', NULL, NULL, 50, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('135', NULL, '采购管理', 'procurement:view', 'menu', NULL, NULL, NULL, 300, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('165', NULL, '质量管理', 'quality:view', 'menu', NULL, NULL, NULL, 350, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('2', '53', '用户管理', 'system:user:view', 'page', '/system/users', NULL, NULL, 10, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('6', '53', '角色管理', 'system:role:view', 'page', '/system/roles', NULL, NULL, 20, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('10', '53', '权限管理', 'system:permission:view', 'page', '/system/permissions', NULL, NULL, 30, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('11', '53', '操作日志', 'system:log:view', 'page', '/system/logs', NULL, NULL, 40, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('15', '14', '产品与物料', 'product:products:view', 'page', '/product/products', NULL, NULL, 10, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('21', '14', '分类配置', 'product:categories:view', 'page', '/product/categories', NULL, NULL, 20, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('25', '14', '工序管理', 'product:processes:view', 'page', '/product/processes', NULL, NULL, 30, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('30', '14', '工艺路线', 'product:routes:view', 'page', '/product/process-routes', NULL, NULL, 40, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('55', '54', '工单管理', 'production:orders:view', 'page', '/production/orders', NULL, NULL, 10, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('59', '54', '生产任务', 'production:tasks:view', 'page', '/production/tasks', NULL, NULL, 20, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('77', '54', '我的工序', 'production:worker-tasks:view', 'page', '/production/worker-tasks', NULL, NULL, 30, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('78', '54', '生产追溯', 'production:trace:view', 'page', '/production/trace', NULL, NULL, 40, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('82', '93', '库存查询', 'warehouse:inventory:view', 'page', '/warehouse/inventory', NULL, NULL, 10, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('83', '93', '入库管理', 'warehouse:inbound:view', 'page', '/warehouse/inbound-orders', NULL, NULL, 30, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('94', '93', '退料管理', 'warehouse:returns:view', 'page', '/warehouse/return-orders', NULL, NULL, 70, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('95', '93', '盘点管理', 'warehouse:stock-checks:view', 'page', '/warehouse/stock-checks', NULL, NULL, 90, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('104', '93', '领料损耗', 'warehouse:scraps:view', 'page', '/warehouse/scraps', NULL, NULL, 80, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('125', '124', '审批流程配置', 'approval:configure', 'page', '/approval/flows', NULL, NULL, 10, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('126', '124', '处理审批', 'approval:decide', 'api', NULL, NULL, NULL, 20, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('136', '135', '供应商配置', 'procurement:suppliers:view', 'page', '/procurement/suppliers', NULL, NULL, 10, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('139', '135', '采购单', 'procurement:orders:view', 'page', '/procurement/purchase-orders', NULL, NULL, 20, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('145', '93', '采购到货', 'warehouse:receipts:view', 'page', '/procurement/receipts', NULL, NULL, 20, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('149', '165', '来料检验', 'quality:inbound-inspections:view', 'page', '/quality/inbound-inspections', NULL, NULL, 10, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('152', '165', '成品质检', 'quality:finished-inspections:view', 'page', '/quality/finished-inspections', NULL, NULL, 20, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('155', '93', '其他入库', 'warehouse:other-inbounds:view', 'page', '/warehouse/inbound-orders/other', NULL, NULL, 40, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('160', '93', '其他出库', 'warehouse:other-outbounds:view', 'page', '/warehouse/outbound-orders/other', NULL, NULL, 60, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('166', '93', '出库管理', 'warehouse:outbound:view', 'page', '/warehouse/outbound-orders', NULL, NULL, 50, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('168', '165', '工序专检', 'quality:process-inspections:view', 'page', '/quality/process-inspections', NULL, NULL, 30, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('170', '54', '生产报工记录', 'production:execution-records:view', 'page', '/production/execution-records', NULL, NULL, 35, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('172', '53', '业务人员配置', 'system:user-candidates:view', 'page', '/system/user-candidates', NULL, NULL, 50, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('175', '53', '模板管理', 'system:templates:view', 'page', '/system/templates', NULL, NULL, 60, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('3', '2', '创建用户', 'system:user:create', 'api', NULL, NULL, NULL, 10, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('4', '2', '更新用户', 'system:user:update', 'api', NULL, NULL, NULL, 20, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('5', '2', '分配用户角色', 'system:user:assign-roles', 'api', NULL, NULL, NULL, 40, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('7', '6', '创建角色', 'system:role:create', 'api', NULL, NULL, NULL, 10, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('8', '6', '更新角色', 'system:role:update', 'button', NULL, NULL, NULL, 20, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('9', '6', '分配角色权限', 'system:role:assign-permissions', 'api', NULL, NULL, NULL, 40, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('12', '2', '重置用户密码', 'system:user:reset-password', 'api', NULL, NULL, NULL, 30, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('13', '6', '删除角色', 'system:role:delete', 'api', NULL, NULL, NULL, 30, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('16', '15', '新增产品', 'product:products:create', 'api', NULL, NULL, NULL, 10, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('17', '15', '编辑产品', 'product:products:update', 'api', NULL, NULL, NULL, 20, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('18', '15', '变更产品状态', 'product:products:change-status', 'api', NULL, NULL, NULL, 30, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('19', '15', '维护产品 BOM', 'product:products:manage-bom', 'api', NULL, NULL, NULL, 40, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('20', '15', '设置产品默认路线', 'product:products:set-default-route', 'api', NULL, NULL, NULL, 50, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('22', '21', '新增分类', 'product:categories:create', 'api', NULL, NULL, NULL, 10, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('23', '21', '编辑分类', 'product:categories:update', 'api', NULL, NULL, NULL, 20, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('24', '21', '变更分类状态', 'product:categories:change-status', 'api', NULL, NULL, NULL, 30, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('26', '25', '新增工序', 'product:processes:create', 'api', NULL, NULL, NULL, 10, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('27', '25', '编辑工序', 'product:processes:update', 'api', NULL, NULL, NULL, 20, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('28', '25', '变更工序状态', 'product:processes:change-status', 'api', NULL, NULL, NULL, 30, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('29', '25', '上传工序 SOP', 'product:processes:upload-sop', 'api', NULL, NULL, NULL, 40, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('31', '30', '新增路线', 'product:routes:create', 'api', NULL, NULL, NULL, 10, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('32', '30', '编辑路线', 'product:routes:update', 'api', NULL, NULL, NULL, 20, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('33', '30', '变更路线状态', 'product:routes:change-status', 'api', NULL, NULL, NULL, 30, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('34', '30', '维护路线步骤', 'product:routes:manage-steps', 'api', NULL, NULL, NULL, 40, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('35', '30', '删除草稿路线', 'product:routes:delete', 'api', NULL, NULL, NULL, 50, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('46', '15', '查看技术文件', 'product:files:view', 'api', NULL, NULL, NULL, 130, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('47', '15', '上传技术文件', 'product:files:upload', 'api', NULL, NULL, NULL, 140, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('48', '15', '下载技术文件', 'product:files:download', 'api', NULL, NULL, NULL, 150, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('50', '15', '关联工序技术文件', 'product:files:attach', 'api', NULL, NULL, NULL, 160, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('56', '55', '创建工单', 'production:orders:create', 'api', NULL, NULL, NULL, 10, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('57', '55', '编辑工单', 'production:orders:update', 'api', NULL, NULL, NULL, 20, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('58', '55', '办理工单状态', 'production:orders:transition', 'api', NULL, NULL, NULL, 30, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('60', '59', '创建生产任务', 'production:batches:create', 'api', NULL, NULL, NULL, 10, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('61', '59', '编辑生产任务', 'production:batches:update', 'api', NULL, NULL, NULL, 20, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('62', '59', '办理任务开工与状态', 'production:batches:transition', 'api', NULL, NULL, NULL, 30, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('63', '77', '工序报工', 'production:steps:report', 'api', NULL, NULL, NULL, 20, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('70', '59', '工序执行与报工管理', 'production:steps:manage-execution', 'api', NULL, NULL, NULL, 120, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('71', '59', '查看任务用料', 'production:materials:view', 'api', NULL, NULL, NULL, 60, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('72', '59', '分配任务用料', 'production:materials:allocate', 'api', NULL, NULL, NULL, 70, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('73', '166', '创建生产领料单', 'warehouse:outbound:create', 'api', NULL, NULL, NULL, 10, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('74', '59', '生产工序派工', 'production:steps:assign', 'api', NULL, NULL, NULL, 140, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('75', '77', '本人负责工序开始、完成与重开', 'production:steps:start', 'api', NULL, NULL, NULL, 10, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('79', '166', '确认生产领料出库', 'warehouse:outbound:confirm', 'api', NULL, NULL, NULL, 20, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('80', '166', '取消待确认领料单', 'warehouse:outbound:cancel', 'api', NULL, NULL, NULL, 30, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('85', '83', '确认外购物料入库', 'warehouse:inbound:confirm-purchase', 'api', NULL, NULL, NULL, 10, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('90', '59', '审核工序异常', 'production:steps:manage-abnormal', 'api', NULL, NULL, NULL, 130, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('91', '59', '执行生产返工', 'production:rework:execute', 'api', NULL, NULL, NULL, 150, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('97', '94', '创建退料单', 'warehouse:returns:create', 'api', NULL, NULL, NULL, 10, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('98', '94', '确认退料入库', 'warehouse:returns:confirm', 'api', NULL, NULL, NULL, 20, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('99', '94', '取消退料单', 'warehouse:returns:cancel', 'api', NULL, NULL, NULL, 30, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('100', '95', '创建盘点单', 'warehouse:stock-checks:create', 'api', NULL, NULL, NULL, 10, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('101', '95', '录入盘点数量', 'warehouse:stock-checks:count', 'api', NULL, NULL, NULL, 20, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('102', '95', '完成库存盘点', 'warehouse:stock-checks:complete', 'api', NULL, NULL, NULL, 30, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('103', '95', '取消库存盘点', 'warehouse:stock-checks:cancel', 'api', NULL, NULL, NULL, 40, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('105', '104', '申报生产领料损耗', 'warehouse:scraps:create', 'api', NULL, NULL, NULL, 10, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('106', '104', '确认生产领料损耗', 'warehouse:scraps:confirm', 'api', NULL, NULL, NULL, 20, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('107', '104', '取消生产领料损耗', 'warehouse:scraps:cancel', 'api', NULL, NULL, NULL, 30, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('111', '15', '查看物料版本', 'product:material-variants:view', 'api', NULL, NULL, NULL, 100, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('112', '15', '新增物料版本', 'product:material-variants:create', 'api', NULL, NULL, NULL, 110, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('113', '15', '变更物料版本状态', 'product:material-variants:change-status', 'api', NULL, NULL, NULL, 120, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('114', '59', '查看物料需求', 'production:material-demands:view', 'api', NULL, NULL, NULL, 90, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('115', '59', '配置版本需求', 'production:material-demands:configure', 'api', NULL, NULL, NULL, 100, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('116', '59', '人工追加需求', 'production:material-demands:add-manual', 'api', NULL, NULL, NULL, 110, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('117', '15', '查看基础物料', 'product:materials:view', 'api', NULL, NULL, NULL, 60, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('118', '15', '新增基础物料', 'product:materials:create', 'api', NULL, NULL, NULL, 70, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('119', '15', '编辑基础物料', 'product:materials:update', 'api', NULL, NULL, NULL, 80, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('120', '15', '变更基础物料状态', 'product:materials:change-status', 'api', NULL, NULL, NULL, 90, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('128', '59', '结束任务并登记产出', 'production:tasks:terminate', 'api', NULL, NULL, NULL, 40, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('129', '59', '申请需求更正与关闭', 'production:materials:correct-demand', 'api', NULL, NULL, NULL, 80, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('130', '59', '维护产出清单与结案', 'production:tasks:manage-output', 'api', NULL, NULL, NULL, 50, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('133', '83', '确认成品入库', 'warehouse:inbound:confirm-finished', 'api', NULL, NULL, NULL, 20, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('137', '136', '新增供应商', 'procurement:suppliers:create', 'button', NULL, NULL, NULL, 10, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('138', '136', '修改供应商', 'procurement:suppliers:update', 'button', NULL, NULL, NULL, 20, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('140', '139', '新增采购单', 'procurement:orders:create', 'button', NULL, NULL, NULL, 10, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('141', '139', '修改采购草稿', 'procurement:orders:update', 'button', NULL, NULL, NULL, 20, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('142', '139', '确认下单', 'procurement:orders:place', 'button', NULL, NULL, NULL, 30, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('143', '139', '取消采购单', 'procurement:orders:cancel', 'button', NULL, NULL, NULL, 40, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('144', '139', '关闭采购行', 'procurement:orders:close', 'button', NULL, NULL, NULL, 50, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('146', '145', '登记采购到货', 'warehouse:receipts:confirm', 'button', NULL, NULL, NULL, 10, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('147', '145', '更正采购实收', 'warehouse:receipts:correct', 'button', NULL, NULL, NULL, 30, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('148', '145', '退回供应商', 'warehouse:receipts:return', 'button', NULL, NULL, NULL, 40, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('150', '149', '发起来料复核', 'quality:inbound-inspections:review', 'button', NULL, NULL, NULL, 10, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('151', '149', '完成来料检验', 'quality:inbound-inspections:inspect', 'button', NULL, NULL, NULL, 20, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('153', '152', '登记成品质检', 'quality:finished-inspections:record', 'button', NULL, NULL, NULL, 10, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('154', '145', '核对并确认来料清单', 'warehouse:receipts:accept', 'button', NULL, NULL, NULL, 20, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('156', '155', '创建其他入库', 'warehouse:other-inbounds:create', 'api', NULL, NULL, NULL, 10, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('157', '155', '编辑其他入库', 'warehouse:other-inbounds:update', 'api', NULL, NULL, NULL, 20, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('158', '155', '确认其他入库', 'warehouse:other-inbounds:confirm', 'api', NULL, NULL, NULL, 30, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('159', '155', '取消其他入库', 'warehouse:other-inbounds:cancel', 'api', NULL, NULL, NULL, 40, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('161', '160', '创建其他出库', 'warehouse:other-outbounds:create', 'api', NULL, NULL, NULL, 10, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('162', '160', '编辑其他出库', 'warehouse:other-outbounds:update', 'api', NULL, NULL, NULL, 20, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('163', '160', '确认其他出库', 'warehouse:other-outbounds:confirm', 'api', NULL, NULL, NULL, 30, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('164', '160', '取消其他出库', 'warehouse:other-outbounds:cancel', 'api', NULL, NULL, NULL, 40, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('169', '168', '登记与更正工序专检', 'quality:process-inspections:record', 'button', NULL, NULL, NULL, 10, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('171', '145', '作废到货登记', 'warehouse:receipts:void', 'button', NULL, NULL, NULL, 50, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('173', '172', '配置业务候选角色', 'system:user-candidates:configure', 'api', NULL, NULL, NULL, 10, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('174', '149', '管理来料质检分组', 'quality:inbound-inspections:manage', 'button', NULL, NULL, NULL, 30, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('176', '175', '创建模板', 'system:templates:create', 'api', NULL, NULL, NULL, 10, 1);

INSERT INTO permissions (id, parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
VALUES ('177', '175', '修改模板', 'system:templates:update', 'api', NULL, NULL, NULL, 20, 1);

COMMIT;
