import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { WorkOrderType } from '@company/contracts';
import { ProductionDomainError } from '../domain/production.errors.js';

export type LockedWorkOrderMaterialPolicy = {
  workOrderId: string;
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
  return { workOrderId: String(order.id), orderType: order.order_type };
}

/** 批量单按整个工单固定同一基础物料的精确版本；研发单不写选择表。 */
export async function requireWorkOrderMaterialVariant(
  db: PoolConnection,
  policy: LockedWorkOrderMaterialPolicy,
  materialId: string | number,
  materialVariantId: string | number,
  actorId: string,
): Promise<void> {
  if (policy.orderType === 'research') return;
  const [[choice]] = await db.query<(RowDataPacket & { material_variant_id: number })[]>(
    `SELECT material_variant_id FROM work_order_material_versions
      WHERE work_order_id=? AND material_id=? FOR UPDATE`,
    [policy.workOrderId, materialId],
  );
  if (choice) {
    if (String(choice.material_variant_id) !== String(materialVariantId))
      throw new ProductionDomainError(
        'INVALID_INPUT',
        '批量生产工单已锁定该物料版本，所有批次及后续补料必须继续使用该版本',
      );
    return;
  }
  await db.execute(
    `INSERT INTO work_order_material_versions
      (work_order_id,material_id,material_variant_id,created_by) VALUES (?,?,?,?)`,
    [policy.workOrderId, materialId, materialVariantId, actorId],
  );
}
