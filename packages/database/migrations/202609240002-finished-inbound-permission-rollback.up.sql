-- Repair the permission directory at the unified inbound boundary. This is idempotent so
-- reset development databases and environments already through 202609240001 agree.
CREATE TEMPORARY TABLE guard_finished_permission_parent (ok TINYINT NOT NULL CHECK(ok=1));
INSERT INTO guard_finished_permission_parent
SELECT IF(EXISTS(SELECT 1 FROM permissions WHERE code='production:inbounds:view'),1,0);
DROP TEMPORARY TABLE guard_finished_permission_parent;

-- Retired draft permissions must not grant a route that no longer exists. The FK cascades
-- old role grants; rollback restores metadata only, never guesses those grants.
DELETE FROM permissions WHERE code IN
  ('production:inbounds:create-finished','production:inbounds:cancel-finished');
INSERT INTO permissions(parent_id,name,code,type,api_method,api_path,sort_order,status)
SELECT parent.id,'确认成品入库','production:inbounds:confirm-finished','api','POST',
  '/api/production/finished-goods-inbounds/actions/confirm',94,1
FROM permissions parent WHERE parent.code='production:inbounds:view'
  AND NOT EXISTS(SELECT 1 FROM permissions WHERE code='production:inbounds:confirm-finished');
UPDATE permissions p JOIN permissions parent ON parent.code='production:inbounds:view'
SET p.parent_id=parent.id,p.name='确认成品入库',p.type='api',p.api_method='POST',
  p.api_path='/api/production/finished-goods-inbounds/actions/confirm',p.sort_order=94,p.status=1
WHERE p.code='production:inbounds:confirm-finished';
