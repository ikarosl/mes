-- Switch application permission consumers together with this catalog rename.
-- Keep the permission ID so explicit role grants and child references survive.
-- A rerun is allowed only when the target metadata already matches this migration.
DROP TEMPORARY TABLE IF EXISTS guard_warehouse_inbound_view;
CREATE TEMPORARY TABLE guard_warehouse_inbound_view (ok TINYINT NOT NULL CHECK (ok=1));
INSERT INTO guard_warehouse_inbound_view SELECT IF(
  (SELECT COUNT(*) FROM permissions
   WHERE code IN ('production:inbounds:view', 'warehouse:inbound:view')) = 1
  AND EXISTS (SELECT 1 FROM permissions WHERE code='warehouse:view')
  AND (
    EXISTS (SELECT 1 FROM permissions WHERE code='production:inbounds:view')
    OR EXISTS (
      SELECT 1 FROM permissions p
      JOIN permissions parent ON parent.id=p.parent_id AND parent.code='warehouse:view'
      WHERE p.code='warehouse:inbound:view'
        AND p.name='入库管理' AND p.type='page'
        AND p.route_path='/warehouse/inbound-orders'
        AND p.api_method IS NULL AND p.api_path IS NULL AND p.sort_order=405
    )
  ), 1, 0);
DROP TEMPORARY TABLE guard_warehouse_inbound_view;

UPDATE permissions p
JOIN permissions parent ON parent.code='warehouse:view'
SET p.parent_id=parent.id,
    p.name='入库管理',
    p.code='warehouse:inbound:view',
    p.type='page',
    p.route_path='/warehouse/inbound-orders',
    p.api_method=NULL,
    p.api_path=NULL,
    p.sort_order=405
WHERE p.code='production:inbounds:view';
