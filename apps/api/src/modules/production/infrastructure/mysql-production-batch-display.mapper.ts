import type { ProductionBatchItem } from '@company/contracts';
import type { RowDataPacket } from 'mysql2/promise';
import type { MaterialVariantQuery } from '../../product/public.js';
import { integerQuantity } from '../domain/integer-quantity.js';
import { mapBatch, type BatchRow, type Db } from './mysql-production.shared.js';

type DemandAuthorizationRow = RowDataPacket & {
  production_batch_id: number;
  item_id: number;
  material_variant_id: number;
  pending_correction_id: number | null;
  need_number: string;
  remaining_number: string;
  allocated_quantity: string;
  unissued_allocated_quantity: string;
  authorized_remaining_quantity: string | null;
};

/** 批量展示投影；版本资格来自 Product 公开查询，写命令仍在自己的事务中重新校验。 */
export const mapBatches = async (
  db: Db,
  batches: BatchRow[],
  variants: MaterialVariantQuery,
): Promise<ProductionBatchItem[]> => {
  if (batches.length === 0) return [];
  const batchIds = batches.map((batch) => String(batch.id));
  const [demands] = await db.query<DemandAuthorizationRow[]>(
    `SELECT demand.production_batch_id,demand.item_id,demand.material_variant_id,
      demand.pending_correction_id,demand.need_number,demand.remaining_number,
      COALESCE((SELECT SUM(allocation.assigned_number)
        FROM production_item_allocation allocation
        WHERE allocation.demand_id=demand.id
          AND allocation.allocation_status NOT IN ('released','cancelled')),0) allocated_quantity,
      COALESCE((SELECT SUM(GREATEST(allocation.assigned_number-COALESCE((
          SELECT SUM(detail.outbound_number)
          FROM outbound_detail detail
          JOIN outbound_order outbound ON outbound.id=detail.outbound_id
          WHERE detail.allocation_id=allocation.id AND outbound.status='completed'
        ),0),0))
        FROM production_item_allocation allocation
        WHERE allocation.demand_id=demand.id
          AND allocation.allocation_status NOT IN ('released','cancelled')),0) unissued_allocated_quantity,
      authorization_detail.authorized_remaining_quantity
     FROM production_item_demand demand
     JOIN production_batches batch ON batch.id=demand.production_batch_id
     LEFT JOIN production_short_batch_authorization_detail authorization_detail
       ON authorization_detail.authorization_id=(
         SELECT authorization.id FROM production_short_batch_authorization authorization
         WHERE authorization.production_batch_id=batch.id AND authorization.status='active'
           AND authorization.material_plan_version=batch.material_plan_version
         ORDER BY authorization.id DESC LIMIT 1
       ) AND authorization_detail.demand_id=demand.id
     WHERE demand.production_batch_id IN (${batchIds.map(() => '?').join(',')})
       AND demand.business_status='active'`,
    batchIds,
  );
  const enabledVariants = new Set(
    (
      await variants.listEnabledByMaterials([
        ...new Set(demands.map((demand) => String(demand.item_id))),
      ])
    ).map((variant) => variant.id),
  );
  const allocationGaps = new Set<string>();
  const coverageGaps = new Set<string>();
  for (const demand of demands) {
    const batchId = String(demand.production_batch_id);
    const remaining = integerQuantity(demand.remaining_number);
    const enabled = enabledVariants.has(String(demand.material_variant_id));
    if (
      demand.pending_correction_id !== null ||
      integerQuantity(demand.allocated_quantity) < integerQuantity(demand.need_number) ||
      (remaining > 0 && !enabled)
    ) {
      allocationGaps.add(batchId);
    }
    const expectedOutbound =
      demand.pending_correction_id !== null || !enabled
        ? 0
        : Math.min(remaining, integerQuantity(demand.unissued_allocated_quantity));
    if (
      demand.authorized_remaining_quantity === null ||
      Math.max(0, remaining - expectedOutbound) >
        integerQuantity(demand.authorized_remaining_quantity)
    ) {
      coverageGaps.add(batchId);
    }
  }
  return batches.map((batch) => {
    const batchId = String(batch.id);
    const status = batch.short_batch_authorization_status;
    const action: ProductionBatchItem['shortBatchAuthorizationAction'] =
      status === 'valid'
        ? coverageGaps.has(batchId)
          ? 'adjust'
          : 'view'
        : !allocationGaps.has(batchId)
          ? 'not_required'
          : status === 'stale'
            ? 'reauthorize'
            : status === 'consumed'
              ? 'view'
              : 'authorize';
    return mapBatch(batch, action);
  });
};
