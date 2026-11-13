import type { ProductionBatchDetail } from '@company/contracts';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { InventoryInboundQuery } from '../../../inventory/public.js';
import { ProductionDomainError } from '../../domain/production.errors.js';
import { findBatch } from '../tasks/mysql-production-batch.persistence.js';
import { mapBatchOverview } from '../tasks/mysql-production-batch.read.js';

/** 调用方已按工单、任务顺序持有根锁；成功响应不复用等待根锁前建立的 RR 快照。 */
export async function selectCurrentBatchOverview(
  db: PoolConnection,
  batchId: string,
  inventory: InventoryInboundQuery,
): Promise<ProductionBatchDetail> {
  const batch = await findBatch(db, batchId, true);
  const [outputs] = await db.query<(RowDataPacket & { id: string; quantity: string })[]>(
    `SELECT CAST(o.id AS CHAR) id,CAST(o.quantity AS CHAR) quantity
     FROM production_tracking_output o LEFT JOIN production_tracking_output_cancellation x ON x.production_output_id=o.id
     WHERE o.production_batch_id=? AND x.id IS NULL ORDER BY o.id FOR SHARE`,
    [batchId],
  );
  const quantityByOutput = new Map(outputs.map((output) => [output.id, BigInt(output.quantity)]));
  const received = new Set<string>();
  let availableQuantity = 0n;
  for (const quantity of quantityByOutput.values()) availableQuantity += quantity;
  let inboundQuantity = 0n;
  for (let offset = 0; offset < outputs.length; offset += 100) {
    const receipts = await inventory.getTrackingOutputReceipts({
      outputIds: outputs.slice(offset, offset + 100).map((output) => output.id),
    });
    for (const receipt of receipts) {
      const quantity = BigInt(receipt.inboundQuantity);
      if (received.has(receipt.outputId) || quantityByOutput.get(receipt.outputId) !== quantity)
        throw new ProductionDomainError('CONFLICT', '产出与实际入库事实不一致，请核查后重试');
      received.add(receipt.outputId);
      inboundQuantity += quantity;
    }
  }
  return {
    ...mapBatchOverview(batch),
    finalOutput: {
      availableQuantity: String(availableQuantity),
      confirmedOutputCount: outputs.length,
      inboundQuantity: String(inboundQuantity),
      pendingInboundQuantity: String(availableQuantity - inboundQuantity),
    },
  };
}
