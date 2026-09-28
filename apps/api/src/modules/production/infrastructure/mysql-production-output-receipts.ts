import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { ProductionOutputReceipts } from '@company/contracts';
import { InventoryInboundCommand } from '../../inventory/public.js';
import { ProductionDomainError } from '../domain/production.errors.js';
/** Production owns category; Inventory owns the immutable receipt facts. */
export async function readProductionOutputReceipts(
  db: PoolConnection,
  inventory: InventoryInboundCommand,
  batchId: string,
  lock: boolean,
): Promise<ProductionOutputReceipts> {
  const [allocations] = await db.query<
    (RowDataPacket & { id: number; category: 'self_made' | 'production_extra' })[]
  >(
    `SELECT a.id,a.category FROM production_output_allocation a
      JOIN production_batch_closeout c ON c.id=a.closeout_id
      WHERE c.production_batch_id=? ORDER BY a.id${lock ? ' FOR SHARE' : ''}`,
    [batchId],
  );
  const facts = await inventory.readFinishedTaskAllocationReceipts(batchId, lock);
  const categories = new Map(allocations.map((row) => [String(row.id), row.category]));
  let planned = 0,
    extra = 0;
  for (const [id, quantity] of Object.entries(facts)) {
    const category = categories.get(id);
    if (!category) throw new ProductionDomainError('INVALID_STATE', '成品入库事实引用无效授权');
    const value = Number(quantity);
    if (!Number.isSafeInteger(value) || value < 0)
      throw new ProductionDomainError('INVALID_STATE', '成品入库事实数量无效');
    if (category === 'self_made') {
      planned += value;
    } else {
      extra += value;
    }
  }
  if (!Number.isSafeInteger(planned) || !Number.isSafeInteger(extra))
    throw new ProductionDomainError('INVALID_STATE', '成品历史入库数量超出范围');
  return { productionReceivedQuantity: String(planned), extraReceivedQuantity: String(extra) };
}
