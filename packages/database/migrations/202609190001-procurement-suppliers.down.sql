-- Do not discard configured supplier identities implicitly; development may reset before rollback.
CREATE TEMPORARY TABLE tmp_procurement_supplier_down_guard (
  invalid_value TINYINT NOT NULL CHECK (invalid_value=0)
) ENGINE=MEMORY;
INSERT INTO tmp_procurement_supplier_down_guard (invalid_value)
SELECT 1 WHERE EXISTS (SELECT 1 FROM procurement_supplier);
DROP TEMPORARY TABLE tmp_procurement_supplier_down_guard;

DROP TABLE procurement_supplier;

DELETE FROM role_permissions WHERE permission_id IN (
  SELECT id FROM permissions WHERE code IN (
    'procurement:view','procurement:suppliers:view',
    'procurement:suppliers:create','procurement:suppliers:update'
  )
);
DELETE FROM permissions WHERE code IN ('procurement:suppliers:create','procurement:suppliers:update');
DELETE FROM permissions WHERE code='procurement:suppliers:view';
DELETE FROM permissions WHERE code='procurement:view';
