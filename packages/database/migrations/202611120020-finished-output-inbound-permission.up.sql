-- Separate actual finished receipt authorization from terminal output confirmation.
-- Keep all existing grants; the new command permission is explicitly assigned by administrators.
CREATE TEMPORARY TABLE tmp_finished_output_permission_guard (
 invalid_data TINYINT NOT NULL,
 CONSTRAINT chk_finished_output_permission_parent CHECK(invalid_data=0)
);
INSERT INTO tmp_finished_output_permission_guard
SELECT 1 WHERE (SELECT COUNT(*) FROM permissions WHERE code='warehouse:inbound:view' AND deleted_at IS NULL)<>1
 OR EXISTS(SELECT 1 FROM permissions WHERE code='warehouse:inbound:confirm-finished');
DROP TEMPORARY TABLE tmp_finished_output_permission_guard;

START TRANSACTION;
INSERT INTO permissions(parent_id,name,code,type,route_path,api_method,api_path,sort_order,status)
SELECT id,'确认成品入库','warehouse:inbound:confirm-finished','api',NULL,NULL,NULL,20,1
FROM permissions WHERE code='warehouse:inbound:view' AND deleted_at IS NULL;
UPDATE permissions SET name='终检确认与未入库产出撤销'
WHERE code='production:tracking:confirm-output';
COMMIT;
