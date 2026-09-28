-- Preparation step for immediate 202609240001 down. Do not start either application
-- between these two down migrations: permission routes and business schema differ.
CREATE TEMPORARY TABLE guard_finished_permission_rollback (ok TINYINT NOT NULL CHECK(ok=1));
INSERT INTO guard_finished_permission_rollback SELECT IF(
  EXISTS(SELECT 1 FROM inbound_order) OR EXISTS(SELECT 1 FROM inbound_detail)
  OR EXISTS(SELECT 1 FROM inventory_transaction) OR EXISTS(SELECT 1 FROM item_batch)
  OR EXISTS(SELECT 1 FROM procurement_receipt_line) OR EXISTS(SELECT 1 FROM production_output_revision)
  OR EXISTS(SELECT 1 FROM quality_inspection_case) OR EXISTS(SELECT 1 FROM production_batch_closeout),0,1);
INSERT INTO guard_finished_permission_rollback
SELECT IF(EXISTS(SELECT 1 FROM permissions WHERE code='production:inbounds:view'),1,0);
DROP TEMPORARY TABLE guard_finished_permission_rollback;

-- Exact metadata from 202609170002-finished-goods-inbound.up.sql. Existing IDs are
-- preserved when present; no role_permissions rows are recreated.
INSERT INTO permissions(parent_id,name,code,type,api_method,api_path,sort_order,status)
SELECT parent.id,'创建及编辑成品入库单','production:inbounds:create-finished','api','POST',
  '/api/production/finished-goods-inbounds',93,1
FROM permissions parent WHERE parent.code='production:inbounds:view'
  AND NOT EXISTS(SELECT 1 FROM permissions WHERE code='production:inbounds:create-finished');
UPDATE permissions p JOIN permissions parent ON parent.code='production:inbounds:view'
SET p.parent_id=parent.id,p.name='创建及编辑成品入库单',p.type='api',p.api_method='POST',
  p.api_path='/api/production/finished-goods-inbounds',p.sort_order=93,p.status=1
WHERE p.code='production:inbounds:create-finished';

INSERT INTO permissions(parent_id,name,code,type,api_method,api_path,sort_order,status)
SELECT parent.id,'确认成品入库','production:inbounds:confirm-finished','api','POST',
  '/api/production/finished-goods-inbounds/:inboundId/actions/confirm',94,1
FROM permissions parent WHERE parent.code='production:inbounds:view'
  AND NOT EXISTS(SELECT 1 FROM permissions WHERE code='production:inbounds:confirm-finished');
UPDATE permissions p JOIN permissions parent ON parent.code='production:inbounds:view'
SET p.parent_id=parent.id,p.name='确认成品入库',p.type='api',p.api_method='POST',
  p.api_path='/api/production/finished-goods-inbounds/:inboundId/actions/confirm',p.sort_order=94,p.status=1
WHERE p.code='production:inbounds:confirm-finished';

INSERT INTO permissions(parent_id,name,code,type,api_method,api_path,sort_order,status)
SELECT parent.id,'取消待确认成品入库单','production:inbounds:cancel-finished','api','POST',
  '/api/production/finished-goods-inbounds/:inboundId/actions/cancel',95,1
FROM permissions parent WHERE parent.code='production:inbounds:view'
  AND NOT EXISTS(SELECT 1 FROM permissions WHERE code='production:inbounds:cancel-finished');
UPDATE permissions p JOIN permissions parent ON parent.code='production:inbounds:view'
SET p.parent_id=parent.id,p.name='取消待确认成品入库单',p.type='api',p.api_method='POST',
  p.api_path='/api/production/finished-goods-inbounds/:inboundId/actions/cancel',p.sort_order=95,p.status=1
WHERE p.code='production:inbounds:cancel-finished';
