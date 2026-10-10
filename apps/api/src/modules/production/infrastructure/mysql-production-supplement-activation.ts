import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { RouteSupplementSource } from '../domain/production-route-quantity.policy.js';
import { supplementFulfillment } from './mysql-production-supplement-requirements.js';

type Db = Pool | PoolConnection;

type SupplementSourceRow = RowDataPacket & {
  scrap_record_id: number;
  supplement_id: number;
  source_step_record_id: number;
  source_step_order: number;
  source_step_code: string;
  source_step_name: string;
  scrap_quantity: string;
  supplement_status: 'approved' | 'fulfilled';
  production_batch_id: number;
};

export type SupplementActivationResult = {
  fulfilledSupplementIds: string[];
};

export const selectRouteSupplementSources = async (
  db: Db,
  batchIds: string[],
  lock = false,
): Promise<Map<string, RouteSupplementSource[]>> => {
  const byBatch = new Map<string, RouteSupplementSource[]>();
  if (batchIds.length === 0) return byBatch;
  const [rows] = await db.query<SupplementSourceRow[]>(
    `SELECT authorization.scrap_record_id,supplement.id supplement_id,
      authorization.production_batch_id,
      authorization.quota_end_step_record_id source_step_record_id,
      step_record.step_order_snapshot source_step_order,
      step_record.step_code_snapshot source_step_code,
      step_record.step_name_snapshot source_step_name,
      authorization.authorized_quantity scrap_quantity,supplement.status supplement_status
     FROM batch_step_scrap_reproduction_authorization authorization
     JOIN production_material_supplement supplement ON supplement.id=authorization.supplement_id
     JOIN batch_step_records step_record ON step_record.id=authorization.quota_end_step_record_id
     WHERE supplement.status<>'cancelled' AND authorization.production_batch_id IN (${batchIds.map(() => '?').join(',')})
     ORDER BY authorization.production_batch_id,step_record.step_order_snapshot,authorization.id${lock ? ' FOR SHARE' : ''}`,
    batchIds,
  );
  for (const row of rows) {
    const batchId = String(row.production_batch_id);
    const source: RouteSupplementSource = {
      scrapRecordId: String(row.scrap_record_id),
      supplementId: String(row.supplement_id),
      sourceStepRecordId: String(row.source_step_record_id),
      sourceStepOrder: row.source_step_order,
      sourceStepCode: row.source_step_code,
      sourceStepName: row.source_step_name,
      quantity: String(row.scrap_quantity),
      status: row.supplement_status === 'fulfilled' ? 'material_ready' : 'pending_material',
    };
    byBatch.set(batchId, [...(byBatch.get(batchId) ?? []), source]);
  }
  return byBatch;
};

/**
 * 必须在出库确认后、生产批次及其全部工序记录均已锁定时调用。
 * 补料记录只记录物料履约情况，授权记录保持不可变。
 */
export const fulfillReadySupplements = async (
  connection: PoolConnection,
  batchId: string,
  actorId: string,
): Promise<SupplementActivationResult> => {
  await connection.query(
    `SELECT id FROM production_material_supplement
     WHERE production_batch_id=? ORDER BY id FOR UPDATE`,
    [batchId],
  );
  const [candidates] = await connection.query<(RowDataPacket & { id: number })[]>(
    `SELECT supplement.id
     FROM production_material_supplement supplement
     WHERE supplement.production_batch_id=? AND supplement.status='approved'
     ORDER BY supplement.id FOR UPDATE`,
    [batchId],
  );
  const fulfilledSupplementIds: string[] = [];
  for (const row of candidates) {
    if ((await supplementFulfillment(connection, String(row.id))).fulfilled)
      fulfilledSupplementIds.push(String(row.id));
  }
  if (fulfilledSupplementIds.length === 0) return { fulfilledSupplementIds: [] };

  await connection.execute(
    `UPDATE production_material_supplement
     SET status='fulfilled',fulfilled_at=NOW(),fulfilled_by=?,version=version+1,updated_by=?
     WHERE id IN (${fulfilledSupplementIds.map(() => '?').join(',')}) AND status='approved'`,
    [actorId, actorId, ...fulfilledSupplementIds],
  );

  return { fulfilledSupplementIds };
};
