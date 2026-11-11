import type {
  PageResult,
  PurchaseExcessReceiptCandidate,
  PurchaseExcessReceiptCandidateQuery,
  PurchaseOrderSupplementReason,
} from '@company/contracts';
import { PROCUREMENT_ERROR_CODES } from '@company/constants';
import { type Db, orderError } from '../mysql-purchase-order.shared.js';
import { date, nullableText, text, type ReadRow } from './receipt-read.shared.js';
import { readReceiptQuantitySummaries } from './receipt-quantities.query.js';
import { readReceiptLinkedSupplements } from './purchase-supplement-summary.query.js';
export async function listSupplementReceiptCandidates(
  db: Db,
  purchaseOrderLineId: string,
  query: PurchaseExcessReceiptCandidateQuery & { page: number; pageSize: number },
  reason: PurchaseOrderSupplementReason,
): Promise<PageResult<PurchaseExcessReceiptCandidate>> {
  const [[source]] = await db.query<ReadRow[]>(
    'SELECT orders.ordered_at FROM procurement_order_line line JOIN procurement_order orders ON orders.id=line.purchase_order_id WHERE line.id=?',
    [purchaseOrderLineId],
  );
  if (!source) return orderError('原采购行不存在', PROCUREMENT_ERROR_CODES.purchaseOrderNotFound);
  if (!source.ordered_at)
    return orderError('补单须关联已正式下单的采购来源', PROCUREMENT_ERROR_CODES.purchaseOrderState);
  const filters = ['line.purchase_order_line_id=?', 'receipt.is_voided=0'],
    params = [purchaseOrderLineId];
  if (query.receiptLineId) {
    filters.push('line.id=?');
    params.push(query.receiptLineId);
  }
  if (query.keyword?.trim()) {
    filters.push('(receipt.receipt_no LIKE ? OR line.supplier_batch_code LIKE ?)');
    params.push('%' + query.keyword.trim() + '%', '%' + query.keyword.trim() + '%');
  }
  const from = `FROM procurement_receipt_line line JOIN procurement_receipt receipt ON receipt.id=line.receipt_id WHERE ${filters.join(' AND ')}`;
  const [[count]] = await db.query<ReadRow[]>(`SELECT COUNT(*) total ${from}`, params);
  const [rows] = await db.query<ReadRow[]>(
    `SELECT line.id,line.receipt_id,line.supplier_batch_code,receipt.receipt_no,receipt.received_at ${from} ORDER BY receipt.received_at DESC,line.id DESC LIMIT ? OFFSET ?`,
    [...params, query.pageSize, (query.page - 1) * query.pageSize],
  );
  const ids = rows.map((row) => text(row.id));
  const quantities = await readReceiptQuantitySummaries(db, ids);
  const linked = await readReceiptLinkedSupplements(db, ids, reason);
  return {
    items: rows.map((row) => ({
      id: text(row.id),
      receiptId: text(row.receipt_id),
      receiptNo: text(row.receipt_no),
      receivedAt: date(row.received_at),
      supplierBatchCode: nullableText(row.supplier_batch_code),
      inboundQuantity: quantities.get(text(row.id))!.inboundQuantity,
      receiptLinkedSupplements: linked.get(text(row.id)) ?? [],
    })),
    total: Number(count?.total ?? 0),
    page: query.page,
    pageSize: query.pageSize,
  };
}
