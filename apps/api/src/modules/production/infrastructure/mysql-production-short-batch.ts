import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { integerQuantity } from '../domain/integer-quantity.js';

type Db = Pool | PoolConnection;
type BatchIdExpression = '?' | 'b.id';

/**
 * 批次仍留在生产现场的净确认领料量；只接受受控 SQL 表达式。
 * 生产领料损耗不从这里扣除，因为损耗没有把物料退回公共库存。
 */
export const netConfirmedMaterialOutboundQuantitySql = (
  batchIdExpression: BatchIdExpression,
): string => `GREATEST(
  COALESCE((
    SELECT SUM(outbound_detail.outbound_number)
    FROM outbound_detail
    JOIN outbound_order ON outbound_order.id=outbound_detail.outbound_id
    WHERE outbound_order.production_batch_id=${batchIdExpression}
      AND outbound_order.status='completed'
  ),0)
  - COALESCE((
    SELECT SUM(return_detail.return_number)
    FROM return_detail
    JOIN return_order ON return_order.id=return_detail.return_id
    WHERE return_order.production_batch_id=${batchIdExpression}
      AND return_order.status='returned'
      AND return_detail.release_after_return=1
  ),0),
0)`;

export const getNetConfirmedMaterialOutboundQuantity = async (
  db: Db,
  batchId: string,
): Promise<number> => {
  const [[row]] = await db.query<(RowDataPacket & { quantity: string })[]>(
    `SELECT ${netConfirmedMaterialOutboundQuantitySql('?')} quantity`,
    [batchId, batchId],
  );
  return integerQuantity(row?.quantity ?? 0);
};

type ShortBatchStartabilityRow = RowDataPacket & {
  production_batch_id: number;
  short_batch_startable: number;
};

/**
 * 员工任务投影使用的批次级批量判定。调用方可以传入工序行提取出的批次 ID；
 * 本方法会再次去重，并且只执行一条查询，避免相同批次按工序重复聚合领退料事实。
 */
export const selectShortBatchStartabilityByBatch = async (
  db: Db,
  batchIds: readonly string[],
): Promise<Map<string, boolean>> => {
  const uniqueBatchIds = [...new Set(batchIds)];
  const startabilityByBatch = new Map<string, boolean>();
  if (uniqueBatchIds.length === 0) return startabilityByBatch;

  const [rows] = await db.query<ShortBatchStartabilityRow[]>(
    `SELECT b.id production_batch_id,
       CASE WHEN b.status='material_partially_outbound'
         AND ${netConfirmedMaterialOutboundQuantitySql('b.id')} > 0
         AND EXISTS (
           SELECT 1 FROM production_short_batch_authorization authorization
           WHERE authorization.production_batch_id=b.id
             AND authorization.material_plan_version=b.material_plan_version
             AND authorization.status='active'
             AND NOT EXISTS (
               SELECT 1 FROM production_item_demand demand
               LEFT JOIN production_short_batch_authorization_detail detail
                 ON detail.authorization_id=authorization.id AND detail.demand_id=demand.id
               WHERE demand.production_batch_id=b.id AND demand.business_status='active'
                 AND (detail.id IS NULL
                   OR demand.remaining_number>detail.authorized_remaining_quantity)
             )
         ) THEN 1 ELSE 0 END short_batch_startable
     FROM production_batches b
     WHERE b.id IN (${uniqueBatchIds.map(() => '?').join(',')})`,
    uniqueBatchIds,
  );
  for (const row of rows)
    startabilityByBatch.set(String(row.production_batch_id), Boolean(row.short_batch_startable));
  return startabilityByBatch;
};

export interface ShortBatchStartEvaluation {
  authorizationId: string | null;
  canStart: boolean;
  blockedReason: string | null;
}

export const hasConsumedShortBatchAuthorization = async (
  db: Db,
  batchId: string,
): Promise<boolean> => {
  const [[row]] = await db.query<(RowDataPacket & { found: number })[]>(
    `SELECT EXISTS(
       SELECT 1 FROM production_short_batch_authorization
       WHERE production_batch_id=? AND status='consumed'
     ) found`,
    [batchId],
  );
  return Boolean(row?.found);
};

export const evaluateShortBatchStart = async (
  db: Db,
  batchId: string,
  materialPlanVersion: number,
  lockAuthorization = false,
): Promise<ShortBatchStartEvaluation> => {
  const [authorizationRows] = await db.query<(RowDataPacket & { id: number })[]>(
    `SELECT id FROM production_short_batch_authorization
     WHERE production_batch_id=? AND material_plan_version=? AND status='active'
     ORDER BY id DESC LIMIT 1${lockAuthorization ? ' FOR UPDATE' : ''}`,
    [batchId, materialPlanVersion],
  );
  const authorization = authorizationRows[0];
  if (!authorization)
    return {
      authorizationId: null,
      canStart: false,
      blockedReason: '短批授权不存在或已因物料需求计划变化而失效',
    };
  if ((await getNetConfirmedMaterialOutboundQuantity(db, batchId)) <= 0)
    return {
      authorizationId: String(authorization.id),
      canStart: false,
      blockedReason: '短批开工前必须仍有大于零的净确认领料量',
    };
  const [[violation]] = await db.query<(RowDataPacket & { count: number })[]>(
    `SELECT COUNT(*) count
     FROM production_item_demand demand
     LEFT JOIN production_short_batch_authorization_detail detail
       ON detail.authorization_id=? AND detail.demand_id=demand.id
     WHERE demand.production_batch_id=? AND demand.business_status='active'
       AND (detail.id IS NULL OR demand.remaining_number>detail.authorized_remaining_quantity)`,
    [authorization.id, batchId],
  );
  if (Number(violation?.count ?? 0) > 0)
    return {
      authorizationId: String(authorization.id),
      canStart: false,
      blockedReason: '实际领料后的物料缺口大于管理员授权的允许缺口',
    };
  return {
    authorizationId: String(authorization.id),
    canStart: true,
    blockedReason: null,
  };
};
