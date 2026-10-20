import type {
  PageResult,
  PurchaseQualityReplacementCandidate,
  PurchaseQualityReplacementCandidateQuery,
} from '@company/contracts';
import { PROCUREMENT_ERROR_CODES } from '@company/constants';
import { type Db, orderError } from '../mysql-purchase-order.shared.js';
import { type ReadRow, date, nullableText, text } from './receipt-read.shared.js';
import { readReceiptLinkedSupplements } from './purchase-supplement-summary.query.js';

export async function listQualityReplacementCandidates(
  db: Db,
  purchaseOrderLineId: string,
  query: PurchaseQualityReplacementCandidateQuery & { page: number; pageSize: number },
): Promise<PageResult<PurchaseQualityReplacementCandidate>> {
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

  const filters = [
    'line.purchase_order_line_id=?',
    'receipt.is_voided=0',
    '(COALESCE(pending.quantity,0)>0 OR COALESCE(returned.quantity,0)>0)',
  ];
  const params = [purchaseOrderLineId];
  if (query.receiptLineId) {
    filters.push('line.id=?');
    params.push(query.receiptLineId);
  }
  if (query.keyword) {
    filters.push(
      `(receipt.receipt_no LIKE ? OR line.supplier_batch_code LIKE ?
        OR EXISTS(SELECT 1 FROM procurement_supplier_return search_return
          WHERE search_return.receipt_line_id=line.id AND search_return.reason_type='quality'
            AND search_return.return_no LIKE ?))`,
    );
    const keyword = `%${query.keyword}%`;
    params.push(keyword, keyword, keyword);
  }
  // 两份数量各自按到货明细聚合，再与来源一对一关联，避免跨轮次分配或退回相乘。
  const from = `FROM procurement_receipt_line line
    JOIN procurement_receipt receipt ON receipt.id=line.receipt_id
    JOIN procurement_receipt_revision revision ON revision.id=line.current_receipt_revision_id
    LEFT JOIN (
      SELECT allocation.receipt_line_id,
        SUM(GREATEST(0,allocation.quantity-COALESCE(executed.returned_quantity,0))) quantity
      FROM procurement_receipt_allocation allocation
      JOIN procurement_receipt_line current_line ON current_line.id=allocation.receipt_line_id
        AND current_line.current_round_id=allocation.round_id
      JOIN procurement_receipt_round current_round ON current_round.id=allocation.round_id
        AND current_round.status='finalized'
      LEFT JOIN procurement_supplier_return executed ON executed.allocation_id=allocation.id
        AND executed.reason_type='quality'
      WHERE allocation.disposition='return' AND allocation.return_reason='quality'
      GROUP BY allocation.receipt_line_id
    ) pending ON pending.receipt_line_id=line.id
    LEFT JOIN (
      SELECT receipt_line_id,SUM(returned_quantity) quantity FROM procurement_supplier_return
      WHERE reason_type='quality' GROUP BY receipt_line_id
    ) returned ON returned.receipt_line_id=line.id
    WHERE ${filters.join(' AND ')}`;
  const [[count]] = await db.query<ReadRow[]>(`SELECT COUNT(*) total ${from}`, params);
  const [rows] = await db.query<ReadRow[]>(
    `SELECT line.id receipt_line_id,line.receipt_id,line.supplier_batch_code,
      receipt.receipt_no,receipt.received_at,revision.received_quantity,
      COALESCE(pending.quantity,0) pending_return_quantity,
      COALESCE(returned.quantity,0) returned_quantity
      ${from}
      ORDER BY receipt.received_at DESC,line.id DESC LIMIT ? OFFSET ?`,
    [...params, query.pageSize, (query.page - 1) * query.pageSize],
  );
  const linked = await readReceiptLinkedSupplements(
    db,
    rows.map((row) => text(row.receipt_line_id)),
    'quality_replacement',
  );
  return {
    items: rows.map((row) => ({
      receiptLineId: text(row.receipt_line_id),
      receiptId: text(row.receipt_id),
      receiptNo: text(row.receipt_no),
      receivedAt: date(row.received_at),
      supplierBatchCode: nullableText(row.supplier_batch_code),
      receivedQuantity: text(row.received_quantity),
      pendingReturnQuantity: text(row.pending_return_quantity),
      returnedQuantity: text(row.returned_quantity),
      receiptLinkedSupplements: linked.get(text(row.receipt_line_id)) ?? [],
    })),
    total: Number(count.total),
    page: query.page,
    pageSize: query.pageSize,
  };
}
