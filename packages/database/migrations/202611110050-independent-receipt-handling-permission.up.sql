-- Split the already available note-only purchase-inbound capability into its own arrival action.
-- Keep business notes and all historical inbound references unchanged.
CREATE TEMPORARY TABLE tmp_receipt_handling_permission_guard (
  invalid_count INT NOT NULL CHECK(invalid_count=0)
);
INSERT INTO tmp_receipt_handling_permission_guard
SELECT 1 WHERE (
  SELECT COUNT(*) FROM permissions
  WHERE code IN ('warehouse:view','warehouse:receipts:view','warehouse:inbound:confirm-purchase')
    AND deleted_at IS NULL
)<>3;
DROP TEMPORARY TABLE tmp_receipt_handling_permission_guard;

START TRANSACTION;
INSERT INTO permissions (parent_id,name,code,type,route_path,api_method,api_path,sort_order,status)
SELECT parent.id,'登记其他处理说明','warehouse:receipts:handle','button',NULL,NULL,NULL,20,1
FROM permissions parent WHERE parent.code='warehouse:receipts:view' AND parent.deleted_at IS NULL;

-- One-time responsibility transfer: only explicit confirm-purchase grants select existing roles.
-- Add page/menu ancestors so those roles can reach the new location; never expand wildcard grants.
INSERT IGNORE INTO role_permissions (role_id,permission_id)
SELECT source.role_id,target.id
FROM role_permissions source
JOIN permissions previous ON previous.id=source.permission_id
JOIN roles role_record ON role_record.id=source.role_id AND role_record.deleted_at IS NULL
JOIN permissions target ON target.code IN (
  'warehouse:receipts:handle','warehouse:receipts:view','warehouse:view'
) AND target.deleted_at IS NULL
WHERE previous.code='warehouse:inbound:confirm-purchase' AND previous.deleted_at IS NULL;
COMMIT;
