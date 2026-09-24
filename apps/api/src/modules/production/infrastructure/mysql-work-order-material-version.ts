import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { WorkOrderType } from '@company/contracts';
import { ProductionDomainError } from '../domain/production.errors.js';

export type LockedWorkOrderMaterialPolicy = {
  workOrderId: string;
  productionBatchId: string;
  orderType: WorkOrderType;
};

/** 锁顺序统一为工单 -> 批次；调用方随后才能锁批次及需求事实。 */
export async function lockWorkOrderForBatch(
  db: PoolConnection,
  productionBatchId: string,
): Promise<LockedWorkOrderMaterialPolicy> {
  const [[identity]] = await db.query<(RowDataPacket & { work_order_id: number })[]>(
    'SELECT work_order_id FROM production_batches WHERE id=?',
    [productionBatchId],
  );
  if (!identity) throw new ProductionDomainError('NOT_FOUND', '生产批次不存在');
  const [[order]] = await db.query<(RowDataPacket & { id: number; order_type: WorkOrderType })[]>(
    'SELECT id,order_type FROM work_orders WHERE id=? FOR UPDATE',
    [identity.work_order_id],
  );
  if (!order) throw new ProductionDomainError('NOT_FOUND', '生产工单不存在');
  return { workOrderId: String(order.id), orderType: order.order_type, productionBatchId };
}

/** 所有后续需求只引用本任务初配冻结的版本。研发无统一版本锁。 */
export async function requireTaskMaterialVariant(
  db: PoolConnection,
  policy: LockedWorkOrderMaterialPolicy,
  materialId: string | number,
  materialVariantId: string | number,
): Promise<void> {
  if (policy.orderType === 'research') return;
  const [[choice]] = await db.query<(RowDataPacket & { locked_material_variant_id: number })[]>(
    `SELECT locked_material_variant_id FROM production_material_requirement_basis
      WHERE production_batch_id=? AND material_id=? FOR SHARE`,
    [policy.productionBatchId, materialId],
  );
  if (!choice) throw new ProductionDomainError('INVALID_STATE', '请先确认本任务的完整初始需求');
  if (String(choice.locked_material_variant_id) !== String(materialVariantId))
    throw new ProductionDomainError('INVALID_INPUT', '所选版本与本任务初始需求锁定版本不一致');
}
