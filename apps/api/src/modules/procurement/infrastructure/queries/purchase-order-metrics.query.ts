import type { ReceiptQuantitySummary } from '@company/contracts';
import type { Db } from '../mysql-purchase-order.shared.js';
import { readReceiptQuantitySummaries } from './receipt-quantities.query.js';
import { type ReadRow, readCurrentRounds, slots, text } from './receipt-read.shared.js';

interface PurchaseLineMetrics {
  quantities: ReceiptQuantitySummary;
  receivedByReceiptLine: Map<string, number>;
}

export async function readPurchaseLineMetrics(
  db: Db,
  lineIds: string[],
): Promise<Map<string, PurchaseLineMetrics>> {
  const result = new Map<string, PurchaseLineMetrics>(
    lineIds.map((id) => [
      id,
      {
        receivedByReceiptLine: new Map(),
        quantities: {
          unprocessedQuantity: '0',
          receivedQuantity: '0',
          undeterminedQuantity: '0',
          approvedQuantity: '0',
          inboundQuantity: '0',
          returnDueQuantity: '0',
          returnedQuantity: '0',
          qualityReturnedQuantity: '0',
          pendingInboundQuantity: '0',
          pendingReturnQuantity: '0',
          hasOpenReview: false,
        },
      },
    ]),
  );
  if (!lineIds.length) return result;
  // 每次实物只归登记到货行的采购来源；补单追溯不转移当前授权或历史执行。
  const [lines] = await db.query<ReadRow[]>(
    `SELECT line.id,line.purchase_order_line_id FROM procurement_receipt_line line
      JOIN procurement_receipt receipt ON receipt.id=line.receipt_id
      WHERE receipt.is_voided=0 AND line.purchase_order_line_id IN (${slots(lineIds)})`,
    lineIds,
  );
  const ids = lines.map((row) => text(row.id));
  const summaries = await readReceiptQuantitySummaries(db, ids, await readCurrentRounds(db, ids));
  for (const line of lines) {
    const target = result.get(text(line.purchase_order_line_id))!;
    const quantities = summaries.get(text(line.id))!;
    target.receivedByReceiptLine.set(text(line.id), Number(quantities.receivedQuantity));
    for (const field of Object.keys(target.quantities) as (keyof ReceiptQuantitySummary)[]) {
      if (field === 'hasOpenReview') target.quantities.hasOpenReview ||= quantities.hasOpenReview;
      else
        target.quantities[field] = String(
          Number(target.quantities[field]) + Number(quantities[field]),
        );
    }
  }
  return result;
}
