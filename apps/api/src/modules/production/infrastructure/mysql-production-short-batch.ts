import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';

type Db = Pool | PoolConnection;

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
  const [[outbound]] = await db.query<(RowDataPacket & { count: number })[]>(
    `SELECT COUNT(*) count FROM outbound_order
     WHERE production_batch_id=? AND status='completed'`,
    [batchId],
  );
  if (Number(outbound?.count ?? 0) === 0)
    return {
      authorizationId: String(authorization.id),
      canStart: false,
      blockedReason: '短批开工前至少需要确认一笔领料出库',
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
