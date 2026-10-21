DELETE rp FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id
WHERE p.code IN ('quality:finished-inspections:view','quality:finished-inspections:record');
DELETE FROM permissions WHERE code='quality:finished-inspections:record';
DELETE FROM permissions WHERE code='quality:finished-inspections:view';

INSERT INTO permissions(parent_id,name,code,type,api_method,api_path,sort_order,status)
SELECT id,'留存成品质检记录','production:tasks:record-inspection','api','POST','/api/production/batches/:batchId/output/inspections',92,1
FROM (SELECT id FROM permissions WHERE code='production:tasks:view') parent;
