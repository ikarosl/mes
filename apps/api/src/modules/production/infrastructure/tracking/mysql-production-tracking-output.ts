import type { PoolConnection, ResultSetHeader } from 'mysql2/promise';
import type {
  ConfirmProductionResearchOutputPayload,
  ProductionTrackingOutput,
  ProductionTrackingPersonnelSnapshot,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
import type { InventoryInboundCommand } from '../../../inventory/public.js';
import { ProductionDomainError } from '../../domain/production.errors.js';
import { writeProductionAudit } from '../shared/mysql-production-audit.js';
import { findBatch } from '../tasks/mysql-production-batch.persistence.js';
import { findWorkOrder } from '../tasks/mysql-work-order.persistence.js';
import { selectTrackingOutput } from './mysql-production-tracking.read.js';

export async function confirmResearchTrackingOutput(
  db: PoolConnection,
  inventory: InventoryInboundCommand,
  batchId: string,
  payload: ConfirmProductionResearchOutputPayload,
  person: ProductionTrackingPersonnelSnapshot,
  context: CommandContext,
): Promise<ProductionTrackingOutput> {
  const batch = await findBatch(db, batchId, true);
  if (batch.version !== payload.version)
    throw new ProductionDomainError('CONCURRENT_MODIFICATION', '记录已变化，请刷新后重试');
  if (batch.status !== 'doing' || batch.order_type !== 'research')
    throw new ProductionDomainError('INVALID_STATE', '只有执行中的研发任务可以在任务级确认产出');
  if (await selectTrackingOutput(db, batchId, null, true))
    throw new ProductionDomainError('CONFLICT', '该研发任务已经确认最终产出');
  await insertTrackingOutput(
    db,
    inventory,
    batchId,
    null,
    payload.availableQuantity,
    payload.remark ?? null,
    person,
    context,
  );
  await db.execute(
    'UPDATE production_batches SET version=version+1,updated_by=? WHERE id=? AND version=?',
    [context.actorId, batchId, payload.version],
  );
  const output = await selectTrackingOutput(db, batchId, null, true);
  if (!output) throw new Error('最终产出写入后缺失');
  return output;
}

export async function insertTrackingOutput(
  db: PoolConnection,
  inventory: InventoryInboundCommand,
  batchId: string,
  cardId: string | null,
  quantity: number,
  remark: string | null,
  person: ProductionTrackingPersonnelSnapshot,
  context: CommandContext,
): Promise<void> {
  const batch = await findBatch(db, batchId, true);
  const order = await findWorkOrder(db, String(batch.work_order_id), true);
  const [created] = await db.execute<ResultSetHeader>(
    'INSERT INTO production_tracking_output (production_batch_id,tracking_card_id,work_order_id,product_id,quantity,personnel_id,personnel_code_snapshot,personnel_name_snapshot,confirmed_by,remark) VALUES (?,?,?,?,?,?,?,?,?,?)',
    [
      batchId,
      cardId,
      batch.work_order_id,
      batch.product_id,
      quantity,
      person.personnelId,
      person.personnelCode,
      person.personnelName,
      context.actorId,
      remark,
    ],
  );
  const outputId = String(created.insertId);
  if (quantity > 0)
    await inventory.confirmTrackingOutput(
      {
        outputId,
        productionBatchId: batchId,
        workOrderId: String(batch.work_order_id),
        productId: String(batch.product_id),
        productCode: batch.product_code_snapshot,
        unit: order.unit_snapshot,
        quantity: String(quantity),
        remark,
      },
      context,
    );
  await writeProductionAudit(
    db,
    context,
    'production-tracking-output.confirm',
    'production_tracking_output',
    outputId,
    null,
    {
      productionBatchId: batchId,
      trackingCardId: cardId,
      quantity: String(quantity),
      ...person,
    },
  );
}
