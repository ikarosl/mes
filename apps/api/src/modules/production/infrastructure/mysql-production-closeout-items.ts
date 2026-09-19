import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type {
  BatchCloseoutDemand,
  BatchCloseoutPendingItem,
  BatchTerminationCheck,
} from '@company/contracts';

/** 仅投影当前收尾工作台，不修改需求来源或既有行动快照。 */
export async function loadCloseoutItems(
  db: PoolConnection,
  check: BatchTerminationCheck,
  lock: boolean,
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
      COALESCE((SELECT SUM(od.outbound_number) FROM outbound_detail od JOIN outbound_order oo ON oo.id=od.outbound_id
        WHERE od.demand_id=d.id AND oo.status='completed'${share}),0) outboundQuantity
     FROM production_item_demand d WHERE d.production_batch_id=? ORDER BY d.id${share}`,
    [check.batchId],
  );
  const [allocations] = await db.query<(RowDataPacket & { id: string; demandId: string })[]>(
    `SELECT CAST(id AS CHAR) id,CAST(demand_id AS CHAR) demandId
     FROM production_item_allocation WHERE production_batch_id=? ORDER BY id${share}`,
    [check.batchId],
  );
  const [outboundDemands] = await db.query<
    (RowDataPacket & { outboundId: string; demandId: string })[]
  >(
    `SELECT CAST(od.outbound_id AS CHAR) outboundId,CAST(od.demand_id AS CHAR) demandId
     FROM outbound_detail od JOIN outbound_order oo ON oo.id=od.outbound_id
     WHERE oo.production_batch_id=? ORDER BY od.id${share}`,
    [check.batchId],
  );
  const allocationDemands = new Map(allocations.map((row) => [row.id, row.demandId]));
  // 物流模块分阶段解锁；后端与工作台使用同一条件，不能绕过界面跳过前序模块。
  const has = (kind: BatchCloseoutPendingItem['kind']) =>
    check.impacts.some((i) => i.kind === kind);
  const pendingItems = check.impacts.map((impact): BatchCloseoutPendingItem => {
    let blockedReason: string | null = null;
    if (impact.kind === 'outbound' && impact.status !== 'pending_picking')
      blockedReason = '请先在出库管理处理已拣料或部分出库单';
    if (impact.kind === 'allocation' && has('outbound'))
      blockedReason = '先处理全部待出库单，再释放分配';
    if (impact.kind === 'demand' && (has('outbound') || has('allocation')))
      blockedReason = '先处理待出库单、剩余预留及冻结或异常分配，再关闭需求';
    if (impact.kind === 'supplement' && (has('outbound') || has('allocation') || has('demand')))
      blockedReason = '先完成出库、分配和剩余需求收尾，再处理补料单';
    const demandIds =
      impact.kind === 'demand'
        ? [impact.id]
        : impact.kind === 'allocation'
          ? [allocationDemands.get(impact.id)!]
          : impact.kind === 'outbound'
            ? [
                ...new Set(
                  outboundDemands
                    .filter((row) => row.outboundId === impact.id)
                    .map((row) => row.demandId),
                ),
              ]
            : impact.kind === 'supplement'
              ? demands.filter((row) => row.supplementId === impact.id).map((row) => row.id)
              : [];
    return { ...impact, demandIds, blockedReason };
  });
  return {
    demands: demands.map((row) => ({
      ...row,
      demandQuantity: String(row.demandQuantity),
      remainingQuantity: String(row.remainingQuantity),
      outboundQuantity: String(row.outboundQuantity),
    })),
    pendingItems,
    allocationDemands,
  };
}
