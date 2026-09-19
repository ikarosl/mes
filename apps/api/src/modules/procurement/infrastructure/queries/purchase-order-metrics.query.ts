import type { ReceiptQuantitySummary } from '@company/contracts';
import type { Db } from '../mysql-purchase-order.shared.js';
import { type ReadRow, slots, text, inboundFactSelect } from './receipt-read.shared.js';

export async function readPurchaseLineMetrics(
  db: Db,
  lineIds: string[],
): Promise<Map<string, { quantities: ReceiptQuantitySummary; hasReceipt: boolean }>> {
  const result = new Map(
    lineIds.map((id) => [
      id,
      {
        hasReceipt: false,
        quantities: {
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
  const [receipts] = await db.query<ReadRow[]>(
    `SELECT line.id,line.purchase_order_line_id,revision.received_quantity
    FROM procurement_receipt_line line JOIN procurement_receipt_revision revision ON revision.id=line.current_receipt_revision_id
    WHERE line.purchase_order_line_id IN (${slots(lineIds)})`,
    lineIds,
  );
  if (!receipts.length) return result;
  const receiptIds = receipts.map((r) => text(r.id));
  const marks = slots(receiptIds);
  const byReceipt = new Map(receipts.map((r) => [text(r.id), text(r.purchase_order_line_id)]));
  const add = (
    receiptId: string,
    field: Exclude<keyof ReceiptQuantitySummary, 'hasOpenReview'>,
    quantity: unknown,
  ) => {
    const target = result.get(byReceipt.get(receiptId)!)!;
    target.quantities[field] = String(Number(target.quantities[field]) + Number(quantity ?? 0));
  };
  for (const receipt of receipts) {
    result.get(text(receipt.purchase_order_line_id))!.hasReceipt = true;
    add(text(receipt.id), 'receivedQuantity', receipt.received_quantity);
  }
  const [scopeSums] = await db.query<ReadRow[]>(
    `SELECT receipt_line_id,disposition,SUM(quantity) quantity FROM procurement_receipt_scope
    WHERE receipt_line_id IN (${marks}) AND disposition IN('uninspected','reviewing','approved','quality_return','termination_return') GROUP BY receipt_line_id,disposition`,
    receiptIds,
  );
  for (const row of scopeSums) {
    const field =
      row.disposition === 'approved'
        ? 'pendingInboundQuantity'
        : row.disposition === 'quality_return' || row.disposition === 'termination_return'
          ? 'pendingReturnQuantity'
          : 'undeterminedQuantity';
    add(text(row.receipt_line_id), field, row.quantity);
  }
  const [inbounds] = await db.query<ReadRow[]>(
    `${inboundFactSelect('detail.procurement_receipt_line_id receipt_line_id,SUM(tx.quantity) quantity')}
    AND detail.procurement_receipt_line_id IN (${marks}) GROUP BY detail.procurement_receipt_line_id`,
    receiptIds,
  );
  for (const row of inbounds) add(text(row.receipt_line_id), 'inboundQuantity', row.quantity);
  const [returns] = await db.query<ReadRow[]>(
    `SELECT receipt_line_id,SUM(returned_quantity) quantity,SUM(CASE WHEN reason_type='quality' THEN returned_quantity ELSE 0 END) quality_quantity
    FROM procurement_supplier_return WHERE receipt_line_id IN (${marks}) GROUP BY receipt_line_id`,
    receiptIds,
  );
  for (const row of returns) {
    add(text(row.receipt_line_id), 'returnedQuantity', row.quantity);
    add(text(row.receipt_line_id), 'qualityReturnedQuantity', row.quality_quantity);
  }
  const [reviews] = await db.query<ReadRow[]>(
    `SELECT DISTINCT q.receipt_line_id FROM quality_inbound_case q WHERE q.receipt_line_id IN (${marks}) AND q.status='reviewing'`,
    receiptIds,
  );
  for (const row of reviews)
    result.get(byReceipt.get(text(row.receipt_line_id))!)!.quantities.hasOpenReview = true;
  for (const value of result.values()) {
    const q = value.quantities;
    q.approvedQuantity = String(Number(q.inboundQuantity) + Number(q.pendingInboundQuantity));
    q.returnDueQuantity = String(Number(q.returnedQuantity) + Number(q.pendingReturnQuantity));
  }
  return result;
}
