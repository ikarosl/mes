-- Switch back to the matching application together with this catalog rename.
-- Preserve the same permission ID, role grants, child references and enablement state.
DROP TEMPORARY TABLE IF EXISTS guard_warehouse_inbound_view;
CREATE TEMPORARY TABLE guard_warehouse_inbound_view (ok TINYINT NOT NULL CHECK (ok=1));
INSERT INTO guard_warehouse_inbound_view SELECT IF(
  (SELECT COUNT(*) FROM permissions
   WHERE code IN ('production:inbounds:view', 'warehouse:inbound:view')) = 1
  AND EXISTS (SELECT 1 FROM permissions WHERE code='production:view')
  AND (
    EXISTS (SELECT 1 FROM permissions WHERE code='warehouse:inbound:view')
    OR EXISTS (
      SELECT 1 FROM permissions p
      JOIN permissions parent ON parent.id=p.parent_id AND parent.code='production:view'
      WHERE p.code='production:inbounds:view'
        AND p.name='查看外购物料入库' AND p.type='api'
        AND p.route_path IS NULL AND p.api_method='GET'
        AND p.api_path='/api/production/purchase-inbounds*' AND p.sort_order=232
    )
  ), 1, 0);
DROP TEMPORARY TABLE guard_warehouse_inbound_view;

UPDATE permissions p
JOIN permissions parent ON parent.code='production:view'
SET p.parent_id=parent.id,
    p.name='查看外购物料入库',
    p.code='production:inbounds:view',
    p.type='api',
    p.route_path=NULL,
    p.api_method='GET',
    p.api_path='/api/production/purchase-inbounds*',
    p.sort_order=232
WHERE p.code='warehouse:inbound:view';
