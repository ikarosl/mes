CREATE TEMPORARY TABLE tmp_attachment_permission_down_guard (
 invalid_data TINYINT NOT NULL,
 CONSTRAINT chk_attachment_permission_unused CHECK(invalid_data=0)
) ENGINE=MEMORY;
INSERT INTO tmp_attachment_permission_down_guard
SELECT 1 WHERE EXISTS(SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id
 WHERE p.code IN ('system:attachments:view','system:attachments:manage','system:attachments:download'))
 OR EXISTS(SELECT 1 FROM operation_logs WHERE module='attachment');
DROP TEMPORARY TABLE tmp_attachment_permission_down_guard;
START TRANSACTION;
DELETE FROM permissions WHERE code IN ('system:attachments:manage','system:attachments:download');
DELETE FROM permissions WHERE code='system:attachments:view';
COMMIT;
