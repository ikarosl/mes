import type {
  PageResult,
  PurchaseExcessReceiptCandidate,
  PurchaseExcessReceiptCandidateQuery,
} from '@company/contracts';
import { PROCUREMENT_ERROR_CODES } from '@company/constants';
import { type Db, orderError } from '../mysql-purchase-order.shared.js';
import { type ReadRow, date, nullableText, text } from './receipt-read.shared.js';

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

  const filters = ['line.purchase_order_line_id=?', 'receipt.is_voided=0'];
  const params = [purchaseOrderLineId];
  if (query.receiptLineId) {
    filters.push('line.id=?');
    params.push(query.receiptLineId);
  }
  if (query.keyword) {
    filters.push('(receipt.receipt_no LIKE ? OR line.supplier_batch_code LIKE ?)');
    params.push(`%${query.keyword}%`, `%${query.keyword}%`);
  }
  const filter = filters.join(' AND ');
  const [[count]] = await db.query<ReadRow[]>(
    `SELECT COUNT(*) total FROM procurement_receipt_line line
      JOIN procurement_receipt receipt ON receipt.id=line.receipt_id WHERE ${filter}`,
    params,
  );
  const [rows] = await db.query<ReadRow[]>(
    `SELECT line.id,line.receipt_id,line.supplier_batch_code,
      receipt.receipt_no,receipt.received_at,revision.received_quantity
      FROM procurement_receipt_line line
      JOIN procurement_receipt receipt ON receipt.id=line.receipt_id
      JOIN procurement_receipt_revision revision ON revision.id=line.current_receipt_revision_id
      WHERE ${filter} ORDER BY receipt.received_at DESC,line.id DESC LIMIT ? OFFSET ?`,
    [...params, query.pageSize, (query.page - 1) * query.pageSize],
  );
  return {
    items: rows.map((row) => ({
      id: text(row.id),
      receiptId: text(row.receipt_id),
      receiptNo: text(row.receipt_no),
      receivedAt: date(row.received_at),
      supplierBatchCode: nullableText(row.supplier_batch_code),
      receivedQuantity: text(row.received_quantity),
    })),
    total: Number(count.total),
    page: query.page,
    pageSize: query.pageSize,
  };
}
