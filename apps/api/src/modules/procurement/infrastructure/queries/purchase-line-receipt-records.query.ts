import type {
  PurchaseOrderLineReceiptRecordPage,
  PurchaseOrderLineReceiptRecordQuery,
} from '@company/contracts';
import { PROCUREMENT_ERROR_CODES } from '@company/constants';
import { type Db, orderError } from '../mysql-purchase-order.shared.js';
import { readPurchaseLineMetrics } from './purchase-order-metrics.query.js';
import { date, nullableText, text, type ReadRow } from './receipt-read.shared.js';
export async function listPurchaseLineReceiptRecords(
  db: Db,
  purchaseOrderLineId: string,
  query: PurchaseOrderLineReceiptRecordQuery & { page: number; pageSize: number },
): Promise<PurchaseOrderLineReceiptRecordPage> {
  const [[line]] = await db.query<ReadRow[]>(
    'SELECT id,fulfillment_mode FROM procurement_order_line WHERE id=?',
    [purchaseOrderLineId],
  );
  if (!line) return orderError('采购行不存在', PROCUREMENT_ERROR_CODES.purchaseOrderNotFound);
  const page = { page: query.page, pageSize: query.pageSize };
  if (line.fulfillment_mode === 'existing_receipt')
    return { ...page, inboundQuantity: '0', items: [], total: 0 };
  const metrics = (await readPurchaseLineMetrics(db, [purchaseOrderLineId])).get(
    purchaseOrderLineId,
  )!;
  const filters = ['line.purchase_order_line_id=?', 'receipt.is_voided=0'],
    params = [purchaseOrderLineId];
  if (query.keyword?.trim()) {
    filters.push(
      '(receipt.receipt_no LIKE ? OR line.supplier_batch_code LIKE ? OR CAST(line.id AS CHAR) LIKE ?)',
    );
    params.push(...Array<string>(3).fill('%' + query.keyword.trim() + '%'));
  }
  const from = `FROM procurement_receipt_line line JOIN procurement_receipt receipt ON receipt.id=line.receipt_id WHERE ${filters.join(' AND ')}`;
  const [[count]] = await db.query<ReadRow[]>(`SELECT COUNT(*) total ${from}`, params);
  const [rows] = await db.query<ReadRow[]>(
    `SELECT line.id,line.receipt_id,line.supplier_batch_code,receipt.receipt_no,receipt.received_at ${from} ORDER BY receipt.received_at DESC,line.id DESC LIMIT ? OFFSET ?`,
    [...params, query.pageSize, (query.page - 1) * query.pageSize],
  );
  return {
    ...page,
    inboundQuantity: metrics.quantities.inboundQuantity,
    total: Number(count?.total ?? 0),
    items: rows.map((row) => ({
      receiptId: text(row.receipt_id),
      receiptLineId: text(row.id),
      receiptNo: text(row.receipt_no),
      receivedAt: date(row.received_at),
      supplierBatchCode: nullableText(row.supplier_batch_code),
      inboundQuantity: metrics.inboundByReceiptLine.get(text(row.id)) ?? '0',
    })),
  };
}
