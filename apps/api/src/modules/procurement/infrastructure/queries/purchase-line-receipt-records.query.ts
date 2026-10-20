import type {
  PurchaseOrderLineReceiptRecordPage,
  PurchaseOrderLineReceiptRecordQuery,
} from '@company/contracts';
import { PROCUREMENT_ERROR_CODES } from '@company/constants';
import { type Db, orderError } from '../mysql-purchase-order.shared.js';
import { readPurchaseLineMetrics } from './purchase-order-metrics.query.js';
import { type ReadRow, date, nullableText, slots, text } from './receipt-read.shared.js';

export async function listPurchaseLineReceiptRecords(
  db: Db,
  purchaseOrderLineId: string,
  query: PurchaseOrderLineReceiptRecordQuery & { page: number; pageSize: number },
): Promise<PurchaseOrderLineReceiptRecordPage> {
  const [[line]] = await db.query<ReadRow[]>('SELECT id FROM procurement_order_line WHERE id=?', [
    purchaseOrderLineId,
  ]);
  if (!line) return orderError('采购行不存在', PROCUREMENT_ERROR_CODES.purchaseOrderNotFound);

  const metrics = (await readPurchaseLineMetrics(db, [purchaseOrderLineId])).get(
    purchaseOrderLineId,
  )!;
  const receiptLineIds = [...metrics.receivedByReceiptLine]
    .filter(([, quantity]) => quantity > 0)
    .map(([id]) => id);
  const page = {
    receivedQuantity: metrics.quantities.receivedQuantity,
    page: query.page,
    pageSize: query.pageSize,
  };
  if (!receiptLineIds.length) return { ...page, items: [], total: 0 };

  const filters = [`line.id IN (${slots(receiptLineIds)})`, 'receipt.is_voided=0'];
  const params = [...receiptLineIds];
  if (query.keyword) {
    filters.push(
      '(receipt.receipt_no LIKE ? OR line.supplier_batch_code LIKE ? OR CAST(line.id AS CHAR) LIKE ?)',
    );
    params.push(`%${query.keyword}%`, `%${query.keyword}%`, `%${query.keyword}%`);
  }
  const from = `FROM procurement_receipt_line line
    JOIN procurement_receipt receipt ON receipt.id=line.receipt_id
    WHERE ${filters.join(' AND ')}`;
  const [[count]] = await db.query<ReadRow[]>(`SELECT COUNT(*) total ${from}`, params);
  const [rows] = await db.query<ReadRow[]>(
    `SELECT line.id,line.receipt_id,line.supplier_batch_code,
      receipt.receipt_no,receipt.received_at ${from}
      ORDER BY receipt.received_at DESC,line.id DESC LIMIT ? OFFSET ?`,
    [...params, query.pageSize, (query.page - 1) * query.pageSize],
  );
  return {
    ...page,
    total: Number(count.total),
    items: rows.map((row) => ({
      receiptId: text(row.receipt_id),
      receiptLineId: text(row.id),
      receiptNo: text(row.receipt_no),
      receivedAt: date(row.received_at),
      supplierBatchCode: nullableText(row.supplier_batch_code),
      receivedQuantity: String(metrics.receivedByReceiptLine.get(text(row.id))!),
    })),
  };
}
