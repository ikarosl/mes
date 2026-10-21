-- Preserve the stable permission identity and role grants when updating its display name.
UPDATE permissions
SET name = '工序执行与报工管理'
WHERE code = 'production:steps:manage-execution';
