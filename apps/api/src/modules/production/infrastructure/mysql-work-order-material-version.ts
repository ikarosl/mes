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

/** 批量单只校验已保存的工单选版，禁止需求或补料隐式创建配置。 */
export async function requireWorkOrderMaterialVariant(
  db: PoolConnection,
  policy: LockedWorkOrderMaterialPolicy,
  materialId: string | number,
  materialVariantId: string | number,
  _actorId: string,
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
        '所选版本与工单物料配置不一致，请重新加载；任务及补料必须使用工单配置版本',
      );
    return;
  }
  throw new ProductionDomainError(
    'INVALID_STATE',
    '请先在工单管理中完整配置物料版本，再生成任务需求',
  );
}
