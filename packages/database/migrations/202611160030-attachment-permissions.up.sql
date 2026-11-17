CREATE TEMPORARY TABLE tmp_attachment_permission_guard (
 invalid_data TINYINT NOT NULL,
 CONSTRAINT chk_attachment_permission_parent CHECK(invalid_data=0)
) ENGINE=MEMORY;
INSERT INTO tmp_attachment_permission_guard
SELECT 1 WHERE (SELECT COUNT(*) FROM permissions WHERE code='system:view' AND deleted_at IS NULL)<>1
 OR EXISTS(SELECT 1 FROM permissions WHERE code IN ('system:attachments:view','system:attachments:manage','system:attachments:download'));
DROP TEMPORARY TABLE tmp_attachment_permission_guard;
START TRANSACTION;
INSERT INTO permissions(parent_id,name,code,type,route_path,api_method,api_path,sort_order,status)
SELECT id,'附件管理','system:attachments:view','page','/system/attachments',NULL,NULL,80,1
FROM permissions WHERE code='system:view' AND deleted_at IS NULL;
INSERT INTO permissions(parent_id,name,code,type,route_path,api_method,api_path,sort_order,status)
SELECT id,'回收与清理附件','system:attachments:manage','api',NULL,NULL,NULL,10,1
FROM permissions WHERE code='system:attachments:view';
INSERT INTO permissions(parent_id,name,code,type,route_path,api_method,api_path,sort_order,status)
SELECT id,'预览与下载附件','system:attachments:download','api',NULL,NULL,NULL,20,1
FROM permissions WHERE code='system:attachments:view';
COMMIT;
