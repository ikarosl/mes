DELETE FROM role_permissions WHERE permission_id IN (
  SELECT id FROM permissions WHERE code IN ('production:materials:outbound-confirm','production:materials:outbound-cancel')
);
DELETE FROM permissions WHERE code IN ('production:materials:outbound-confirm','production:materials:outbound-cancel');

UPDATE outbound_order
SET operator_id=COALESCE(operator_id,created_by,(SELECT MIN(id) FROM users))
WHERE operator_id IS NULL;

ALTER TABLE outbound_order
  MODIFY outbound_at DATETIME NULL,
  MODIFY operator_id BIGINT UNSIGNED NOT NULL;
