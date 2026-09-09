-- 物料需求改为生产任务内弹窗，查看权限只保护接口，不再注册独立页面路由。
UPDATE permissions
SET name = '查看物料需求',
    type = 'api',
    route_path = NULL
WHERE code = 'production:material-demands:view';
