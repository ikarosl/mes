import type {
  PurchaseExcessReceiptCandidate,
  PurchaseOrderStatus,
  PurchaseOrderSupplementReason,
} from '@company/contracts';
import type { Db } from '../mysql-purchase-order.shared.js';
import { type ReadRow, slots, text } from './receipt-read.shared.js';

type SupplementSummary = PurchaseExcessReceiptCandidate['receiptLinkedSupplements'];

/** 同一到货、同一补因共享补单统计，取消单也保留在关联历史中。 */
export async function readReceiptLinkedSupplements(
  db: Db,
  receiptLineIds: string[],
  supplementReason: PurchaseOrderSupplementReason,
): Promise<Map<string, SupplementSummary>> {
  const summaries = new Map<string, SupplementSummary>();
  const ids = [...new Set(receiptLineIds)];
  if (!ids.length) return summaries;
  const [rows] = await db.query<ReadRow[]>(
    `SELECT line.origin_receipt_line_id receipt_line_id,orders.status,
      COUNT(*) line_count,SUM(line.planned_quantity) planned_quantity
     FROM procurement_order_line line JOIN procurement_order orders ON orders.id=line.purchase_order_id
     WHERE line.origin_receipt_line_id IN (${slots(ids)}) AND orders.supplement_reason=?
     GROUP BY line.origin_receipt_line_id,orders.status
     ORDER BY line.origin_receipt_line_id,orders.status`,
    [...ids, supplementReason],
  );
  for (const row of rows) {
    const id = text(row.receipt_line_id);
    summaries.set(id, [
      ...(summaries.get(id) ?? []),
      {
        status: row.status as PurchaseOrderStatus,
        count: Number(row.line_count),
        plannedQuantity: text(row.planned_quantity),
      },
    ]);
  }
  return summaries;
}
