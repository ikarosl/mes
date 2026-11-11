import type { ReceiptQuantitySummary } from '@company/contracts';
import type { Db } from '../mysql-purchase-order.shared.js';
import { readReceiptQuantitySummaries } from './receipt-quantities.query.js';
import { slots, text, type ReadRow } from './receipt-read.shared.js';
interface PurchaseLineMetrics {
  quantities: ReceiptQuantitySummary;
  inboundByReceiptLine: Map<string, string>;
}
export async function readPurchaseLineMetrics(
  db: Db,
  lineIds: string[],
): Promise<Map<string, PurchaseLineMetrics>> {
  const result = new Map<string, PurchaseLineMetrics>(
    lineIds.map((id) => [
      id,
      { inboundByReceiptLine: new Map(), quantities: { inboundQuantity: '0' } },
    ]),
  );
  if (!lineIds.length) return result;
  const [lines] = await db.query<ReadRow[]>(
    `SELECT line.id,line.purchase_order_line_id FROM procurement_receipt_line line JOIN procurement_receipt receipt ON receipt.id=line.receipt_id WHERE receipt.is_voided=0 AND line.purchase_order_line_id IN (${slots(lineIds)})`,
    lineIds,
  );
  const summaries = await readReceiptQuantitySummaries(
    db,
    lines.map((row) => text(row.id)),
  );
  for (const line of lines) {
    const target = result.get(text(line.purchase_order_line_id))!,
      quantity = summaries.get(text(line.id))!.inboundQuantity;
    target.inboundByReceiptLine.set(text(line.id), quantity);
    target.quantities.inboundQuantity = String(
      BigInt(target.quantities.inboundQuantity) + BigInt(quantity),
    );
  }
  return result;
}
