import { closeoutItemBlockedReason } from '../../domain/production-closeout.policy.js';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type {
  BatchCloseoutDemand,
  BatchCloseoutPendingItem,
  BatchTerminationCheck,
} from '@company/contracts';
import type { InventoryProductionDocumentCommand } from '../../../inventory/public.js';
import {
  allocationRequiresCloseout,
  materialQuantitiesOf,
} from '../demand/mysql-production-material-facts.js';

/** 调用者已持任务／收尾根锁；资格只读自有分配与 Inventory 当前事实。 */
export async function demandHasAllocationCloseoutWork(
  db: PoolConnection,
  demandId: string,
  documents: InventoryProductionDocumentCommand,
): Promise<boolean> {
  const [allocations] = await db.query<
    (RowDataPacket & { id: string; assigned_number: string; allocation_status: string })[]
  >(
    `SELECT CAST(id AS CHAR) id,assigned_number,allocation_status FROM production_item_allocation
     WHERE demand_id=? AND allocation_status NOT IN ('released','cancelled') ORDER BY id FOR SHARE NOWAIT`,
    [demandId],
  );
  const quantities = materialQuantitiesOf(
    await documents.facts({ demandIds: [demandId], lock: true }),
  );
  return allocations.some((allocation) =>
    allocationRequiresCloseout(
      {
        id: allocation.id,
        status: allocation.allocation_status,
        assignedQuantity: allocation.assigned_number,
      },
      quantities,
    ),
  );
}

/** 仅投影当前收尾工作台，不修改需求来源或既有行动快照。 */
export async function loadCloseoutItems(
  db: PoolConnection,
  check: BatchTerminationCheck,
  lock: boolean,
  documents: InventoryProductionDocumentCommand,
): Promise<{
  demands: BatchCloseoutDemand[];
  pendingItems: BatchCloseoutPendingItem[];
  allocationDemands: Map<string, string>;
}> {
  const share = lock ? ' FOR SHARE' : '';
  const [demands] = await db.query<(RowDataPacket & BatchCloseoutDemand)[]>(
    `SELECT CAST(d.id AS CHAR) id,d.demand_type demandType,d.business_status status,
      d.item_code_snapshot itemCode,d.material_variant_code_snapshot materialVariantCode,d.unit_snapshot unit,
      d.need_number demandQuantity,d.remaining_number remainingQuantity,
      CAST(d.parent_demand_id AS CHAR) parentDemandId,CAST(d.replaces_demand_id AS CHAR) replacesDemandId,
      CAST(d.supplement_id AS CHAR) supplementId,
      0 outboundQuantity
     FROM production_item_demand d WHERE d.production_batch_id=? ORDER BY d.id${share}`,
    [check.batchId],
  );
  const [allocations] = await db.query<(RowDataPacket & { id: string; demandId: string })[]>(
    `SELECT CAST(id AS CHAR) id,CAST(demand_id AS CHAR) demandId
     FROM production_item_allocation WHERE production_batch_id=? ORDER BY id${share}`,
    [check.batchId],
  );
  const facts = await documents.facts({ productionBatchId: check.batchId, lock });
  const quantities = materialQuantitiesOf(facts);
  const outboundDemands = facts.outbounds.flatMap((order) =>
    order.details.map((line) => ({ outboundId: order.id, demandId: line.demandId })),
  );
  const allocationDemands = new Map(allocations.map((row) => [row.id, row.demandId]));
  const demandIdsOf = (impact: BatchTerminationCheck['impacts'][number]): string[] => {
    if (impact.kind === 'demand') return [impact.id];
    if (impact.kind === 'allocation') return [allocationDemands.get(impact.id)!];
    if (impact.kind === 'outbound')
      return [
        ...new Set(
          outboundDemands.filter((row) => row.outboundId === impact.id).map((row) => row.demandId),
        ),
      ];
    if (impact.kind === 'supplement')
      return demands.filter((row) => row.supplementId === impact.id).map((row) => row.id);
    return [];
  };
  const pendingItems = check.impacts.map((impact): BatchCloseoutPendingItem => {
    const blockedReason = closeoutItemBlockedReason(impact, check.impacts);
    const demandIds = demandIdsOf(impact);
    return { ...impact, demandIds, blockedReason };
  });
  return {
    demands: demands.map((row) => ({
      ...row,
      demandQuantity: String(row.demandQuantity),
      remainingQuantity: String(row.remainingQuantity),
      outboundQuantity: String(quantities.issuedByDemand.get(row.id) ?? 0),
    })),
    pendingItems,
    allocationDemands,
  };
}
