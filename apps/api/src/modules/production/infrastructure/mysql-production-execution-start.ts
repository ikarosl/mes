import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type {
  ProductionExecutionStartCheck,
  ProductionExecutionStartMaterialLine,
  ProductionExecutionStartMaterialSnapshot,
  WorkOrderStatus,
} from '@company/contracts';
import { productionTaskStartBlockedReason } from '../domain/production-execution.policy.js';
import { integerQuantity } from '../domain/integer-quantity.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import type { BatchRow } from './mysql-production.shared.js';

/** 调用方在写命令中先锁工单及任务，所有需求变更与履约都推进任务版本。 */
export async function readProductionExecutionStartCheck(
  db: PoolConnection,
  batch: BatchRow,
  lock = false,
): Promise<ProductionExecutionStartCheck> {
  const share = lock ? ' FOR SHARE' : '';
  const [[order]] = await db.query<(RowDataPacket & { status: WorkOrderStatus })[]>(
    `SELECT status FROM work_orders WHERE id=?${share}`,
    [batch.work_order_id],
  );
  if (!order) throw new ProductionDomainError('NOT_FOUND', '生产工单不存在');
  const [configurationFacts] = await db.query<RowDataPacket[]>(
    batch.order_type === 'research'
      ? `SELECT id FROM production_item_demand
         WHERE production_batch_id=? ORDER BY id LIMIT 1${share}`
      : `SELECT id FROM production_material_requirement_basis
         WHERE production_batch_id=? ORDER BY id${share}`,
    [batch.id],
  );
  // 批量初配一次完整生成不可变 BOM 基础；研发以正式需求存在为配置事实，履约或关闭不撤销。
  const hasInitialMaterialConfiguration = configurationFacts.length > 0;
  const [demands] = await db.query<(RowDataPacket & ProductionExecutionStartMaterialLine)[]>(
    `SELECT CAST(d.id AS CHAR) demandId,d.demand_type demandType,d.business_status businessStatus,
      CAST(d.item_id AS CHAR) itemId,d.item_code_snapshot itemCode,
      CAST(d.material_variant_id AS CHAR) materialVariantId,
      d.material_variant_code_snapshot materialVariantCode,d.unit_snapshot unit,
      d.need_number demandQuantity,d.remaining_number remainingQuantity,
      COALESCE((SELECT SUM(od.outbound_number) FROM outbound_detail od
        JOIN outbound_order oo ON oo.id=od.outbound_id
        WHERE od.demand_id=d.id AND oo.status='completed'${share}),0) confirmedOutboundQuantity
      FROM production_item_demand d
      WHERE d.production_batch_id=? AND d.business_status='active' ORDER BY d.id${share}`,
    [batch.id],
  );
  const lines = demands.map((line) => ({
    ...line,
    demandQuantity: String(integerQuantity(line.demandQuantity)),
    confirmedOutboundQuantity: String(integerQuantity(line.confirmedOutboundQuantity)),
    remainingQuantity: String(integerQuantity(line.remainingQuantity)),
  }));
  const hasMaterialShortage = lines.some((line) => integerQuantity(line.remainingQuantity) > 0);
  const blockedReason = productionTaskStartBlockedReason({
    batchStatus: batch.status,
    workOrderStatus: order.status,
    orderType: batch.order_type,
    hasInitialMaterialConfiguration,
  });
  return {
    productionBatchId: String(batch.id),
    batchStatus: batch.status,
    version: batch.version,
    orderType: batch.order_type,
    workOrderStatus: order.status,
    hasInitialMaterialConfiguration,
    hasMaterialShortage,
    requiresReason: hasMaterialShortage,
    canStart: blockedReason === null,
    blockedReason,
    lines,
  };
}

export function startMaterialSnapshotOf(
  check: ProductionExecutionStartCheck,
): ProductionExecutionStartMaterialSnapshot {
  return {
    hasInitialMaterialConfiguration: check.hasInitialMaterialConfiguration,
    hasMaterialShortage: check.hasMaterialShortage,
    lines: check.lines,
  };
}
