import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { BatchStepStatus } from '@company/contracts';
import {
  calculateRouteStepQuantities,
  type RouteQuantityStep,
  type RouteSupplementSource,
} from '../domain/production-route-quantity.policy.js';

type Db = Pool | PoolConnection;

type SupplementSourceRow = RowDataPacket & {
  scrap_record_id: number;
  supplement_id: number;
  source_step_record_id: number;
  source_step_order: number;
  source_step_code: string;
  source_step_name: string;
  scrap_quantity: string;
  supplement_status: 'approved' | 'activated';
  production_batch_id: number;
};

type ReopenStepRow = RowDataPacket & {
  id: number;
  step_order_snapshot: number;
  need_record_snapshot: number;
  status: BatchStepStatus;
  effective_normal: string;
};

export type SupplementActivationResult = {
  activatedSupplementIds: string[];
  reopenedStepIds: string[];
};

export const selectRouteSupplementSources = async (
  db: Db,
  batchIds: string[],
): Promise<Map<string, RouteSupplementSource[]>> => {
  const byBatch = new Map<string, RouteSupplementSource[]>();
  if (batchIds.length === 0) return byBatch;
  const [rows] = await db.query<SupplementSourceRow[]>(
    `SELECT scrap.id scrap_record_id,supplement.id supplement_id,
      scrap.production_batch_id,scrap.batch_step_record_id source_step_record_id,
      step_record.step_order_snapshot source_step_order,
      step_record.step_code_snapshot source_step_code,
      step_record.step_name_snapshot source_step_name,
      scrap.scrap_quantity,supplement.status supplement_status
     FROM production_material_supplement supplement
     JOIN batch_step_scrap_records scrap ON scrap.id=supplement.scrap_record_id
     JOIN batch_step_records step_record ON step_record.id=scrap.batch_step_record_id
     WHERE scrap.production_batch_id IN (${batchIds.map(() => '?').join(',')})
     ORDER BY scrap.production_batch_id,step_record.step_order_snapshot,scrap.id`,
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
      quantity: row.scrap_quantity,
      status: row.supplement_status === 'activated' ? 'activated' : 'pending_material',
    };
    byBatch.set(batchId, [...(byBatch.get(batchId) ?? []), source]);
  }
  return byBatch;
};

/**
 * Must be called after the outbound order has changed to completed while the batch and all of its
 * step records are locked. This persists the activation fact and reopens only the affected route.
 */
export const activateReadySupplements = async (
  connection: PoolConnection,
  batchId: string,
  plannedQuantity: string,
  actorId: string,
): Promise<SupplementActivationResult> => {
  await connection.query(
    `SELECT id FROM production_material_supplement
     WHERE production_batch_id=? ORDER BY id FOR UPDATE`,
    [batchId],
  );
  const [ready] = await connection.query<(RowDataPacket & { id: number })[]>(
    `SELECT supplement.id
     FROM production_material_supplement supplement
     WHERE supplement.production_batch_id=? AND supplement.status='approved'
       AND EXISTS (
         SELECT 1 FROM production_material_supplement_detail detail
         WHERE detail.supplement_id=supplement.id
       )
       AND NOT EXISTS (
         SELECT 1
         FROM production_material_supplement_detail detail
         LEFT JOIN production_item_demand demand
           ON demand.source_supplement_detail_id=detail.id
           AND demand.demand_type='scrap_supplement'
           AND demand.business_status='active'
         WHERE detail.supplement_id=supplement.id
           AND (
             demand.id IS NULL
             OR COALESCE((
               SELECT SUM(outbound_detail.outbound_number)
               FROM outbound_detail outbound_detail
               JOIN outbound_order outbound_order
                 ON outbound_order.id=outbound_detail.outbound_id
                 AND outbound_order.status='completed'
               WHERE outbound_detail.demand_id=demand.id
             ),0) < demand.need_number
           )
       )
     ORDER BY supplement.id`,
    [batchId],
  );
  const activatedSupplementIds = ready.map((row) => String(row.id));
  if (activatedSupplementIds.length === 0)
    return { activatedSupplementIds: [], reopenedStepIds: [] };

  await connection.execute(
    `UPDATE production_material_supplement
     SET status='activated',activated_at=NOW(),activated_by=?
     WHERE id IN (${activatedSupplementIds.map(() => '?').join(',')}) AND status='approved'`,
    [actorId, ...activatedSupplementIds],
  );

  const [steps] = await connection.query<ReopenStepRow[]>(
    `SELECT step_record.id,step_record.step_order_snapshot,step_record.need_record_snapshot,
      step_record.status,
      COALESCE(SUM(CASE WHEN report.report_type='normal'
        THEN report.normal_quantity ELSE -report.normal_quantity END),0) effective_normal
     FROM batch_step_records step_record
     LEFT JOIN batch_step_reports report ON report.batch_step_record_id=step_record.id
     WHERE step_record.production_batch_id=?
     GROUP BY step_record.id,step_record.step_order_snapshot,step_record.need_record_snapshot,
       step_record.status
     ORDER BY step_record.step_order_snapshot,step_record.id`,
    [batchId],
  );
  const sources = (await selectRouteSupplementSources(connection, [batchId])).get(batchId) ?? [];
  const quantities = calculateRouteStepQuantities(
    plannedQuantity,
    steps.map<RouteQuantityStep>((step) => ({
      id: step.id,
      stepOrder: step.step_order_snapshot,
      needRecord: Boolean(step.need_record_snapshot),
      status: step.status,
      effectiveDirectReported: 0,
      effectiveNormal: step.effective_normal,
    })),
    sources,
  );
  const newlyActivatedOrders = sources
    .filter((source) => activatedSupplementIds.includes(source.supplementId))
    .map((source) => source.sourceStepOrder);
  const reopenedStepIds: string[] = [];
  for (const step of steps) {
    const isOnNewRoute = newlyActivatedOrders.some(
      (sourceStepOrder) => step.step_order_snapshot <= sourceStepOrder,
    );
    const quantity = quantities.get(String(step.id));
    const shouldReopen =
      isOnNewRoute &&
      step.status === 'completed' &&
      (!step.need_record_snapshot ||
        Number(step.effective_normal) < Number(quantity?.requiredNormalQuantity ?? 0));
    if (!shouldReopen) continue;
    await connection.execute(
      `UPDATE batch_step_records
       SET status='doing',completed_at=NULL,version=version+1,updated_by=?
       WHERE id=? AND status='completed'`,
      [actorId, step.id],
    );
    reopenedStepIds.push(String(step.id));
  }
  return { activatedSupplementIds, reopenedStepIds };
};
