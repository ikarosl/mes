-- Finished-product inspection is a Quality page and an independently authorized command.
DELETE rp FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id
WHERE p.code='production:tasks:record-inspection';
DELETE FROM permissions WHERE code='production:tasks:record-inspection';

INSERT INTO permissions(parent_id,name,code,type,route_path,api_method,api_path,sort_order,status)
VALUES(NULL,'成品质检','quality:finished-inspections:view','page','/quality/finished-inspections','GET','/api/quality/finished-inspections*',273,1);
INSERT INTO permissions(parent_id,name,code,type,route_path,api_method,api_path,sort_order,status)
SELECT id,'登记成品质检','quality:finished-inspections:record','button',NULL,'POST','/api/quality/finished-inspections/*/actions/record',274,1
FROM permissions WHERE code='quality:finished-inspections:view';
