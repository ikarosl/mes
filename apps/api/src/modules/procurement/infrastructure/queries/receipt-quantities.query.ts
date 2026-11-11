import type { ReceiptQuantitySummary } from '@company/contracts';
import type { Db } from '../mysql-purchase-order.shared.js';
import { inboundFactSelect, slots, type ReadRow, text } from './receipt-read.shared.js';
export async function readReceiptQuantitySummaries(
  db: Db,
  ids: string[],
): Promise<Map<string, ReceiptQuantitySummary>> {
  const result = new Map(ids.map((id) => [id, { inboundQuantity: '0' }]));
  if (!ids.length) return result;
  const [rows] = await db.query<ReadRow[]>(
    `${inboundFactSelect('detail.procurement_receipt_line_id receipt_line_id,SUM(tx.quantity) inbound_quantity')} AND detail.procurement_receipt_line_id IN (${slots(ids)}) GROUP BY detail.procurement_receipt_line_id`,
    ids,
  );
  for (const row of rows)
    result.set(text(row.receipt_line_id), { inboundQuantity: text(row.inbound_quantity) });
  return result;
}
