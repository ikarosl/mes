import type {
  PageResult,
  PurchaseExcessReceiptCandidate,
  PurchaseExcessReceiptCandidateQuery,
} from '@company/contracts';
import { PROCUREMENT_ERROR_CODES } from '@company/constants';
import { type Db, orderError } from '../mysql-purchase-order.shared.js';
import {
  type ReadRow,
  date,
  inboundFactSelect,
  nullableText,
  slots,
  text,
} from './receipt-read.shared.js';

export async function listExcessReceiptCandidates(
  db: Db,
  purchaseOrderLineId: string,
  query: PurchaseExcessReceiptCandidateQuery & { page: number; pageSize: number },
): Promise<PageResult<PurchaseExcessReceiptCandidate>> {
  const [[source]] = await db.query<ReadRow[]>(
    `SELECT orders.ordered_at FROM procurement_order_line line
      JOIN procurement_order orders ON orders.id=line.purchase_order_id WHERE line.id=?`,
    [purchaseOrderLineId],
  );
  if (!source) return orderError('原采购行不存在', PROCUREMENT_ERROR_CODES.purchaseOrderNotFound);
  if (!source.ordered_at)
    return orderError(
      '补单必须追溯已经正式下单的采购行',
      PROCUREMENT_ERROR_CODES.purchaseOrderState,
    );

  const filter = `line.purchase_order_line_id=?${query.receiptLineId ? ' AND line.id=?' : ''}`;
  const params = [purchaseOrderLineId, ...(query.receiptLineId ? [query.receiptLineId] : [])];
  const [[count]] = await db.query<ReadRow[]>(
    `SELECT COUNT(*) total FROM procurement_receipt_line line WHERE ${filter}`,
    params,
  );
  const [rows] = await db.query<ReadRow[]>(
    `SELECT line.id,line.receipt_id,line.line_no,line.supplier_batch_code,
      receipt.receipt_no,receipt.received_at,revision.received_quantity
      FROM procurement_receipt_line line
      JOIN procurement_receipt receipt ON receipt.id=line.receipt_id
      JOIN procurement_receipt_revision revision ON revision.id=line.current_receipt_revision_id
      WHERE ${filter} ORDER BY receipt.received_at DESC,line.id DESC LIMIT ? OFFSET ?`,
    [...params, query.pageSize, (query.page - 1) * query.pageSize],
  );
  const ids = rows.map((row) => text(row.id));
  const inboundTotals = new Map<string, number>();
  const returnTotals = new Map<string, number>();
  if (ids.length) {
    const [inbounds] = await db.query<ReadRow[]>(
      `${inboundFactSelect('detail.procurement_receipt_line_id receipt_line_id,SUM(tx.quantity) quantity')}
        AND detail.procurement_receipt_line_id IN (${slots(ids)}) GROUP BY detail.procurement_receipt_line_id`,
      ids,
    );
    const [returns] = await db.query<ReadRow[]>(
      `SELECT receipt_line_id,SUM(returned_quantity) quantity FROM procurement_supplier_return
        WHERE receipt_line_id IN (${slots(ids)}) GROUP BY receipt_line_id`,
      ids,
    );
    for (const row of inbounds) inboundTotals.set(text(row.receipt_line_id), Number(row.quantity));
    for (const row of returns) returnTotals.set(text(row.receipt_line_id), Number(row.quantity));
  }
  return {
    items: rows.map((row) => ({
      id: text(row.id),
      receiptId: text(row.receipt_id),
      receiptNo: text(row.receipt_no),
      lineNo: Number(row.line_no),
      receivedAt: date(row.received_at),
      supplierBatchCode: nullableText(row.supplier_batch_code),
      receivedQuantity: text(row.received_quantity),
      unprocessedQuantity: String(
        Number(row.received_quantity) -
          (inboundTotals.get(text(row.id)) ?? 0) -
          (returnTotals.get(text(row.id)) ?? 0),
      ),
    })),
    total: Number(count.total),
    page: query.page,
    pageSize: query.pageSize,
  };
}
