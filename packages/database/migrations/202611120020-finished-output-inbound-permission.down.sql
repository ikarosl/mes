-- Refuse to discard role configuration or completed business use of the new command.
CREATE TEMPORARY TABLE tmp_finished_output_permission_down_guard (
 invalid_data TINYINT NOT NULL,
 CONSTRAINT chk_finished_output_permission_unused CHECK(invalid_data=0)
);
INSERT INTO tmp_finished_output_permission_down_guard
SELECT 1 WHERE EXISTS(SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id
 WHERE p.code='warehouse:inbound:confirm-finished')
 OR EXISTS(SELECT 1 FROM operation_logs WHERE action='inventory.tracking-output.inbound');
DROP TEMPORARY TABLE tmp_finished_output_permission_down_guard;

START TRANSACTION;
DELETE FROM permissions WHERE code='warehouse:inbound:confirm-finished';
UPDATE permissions SET name='终检产出并入库' WHERE code='production:tracking:confirm-output';
COMMIT;
