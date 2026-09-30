import type {
  PageResult,
  PurchaseOrderStatus,
  PurchaseQualityReplacementCandidate,
  PurchaseQualityReplacementCandidateQuery,
} from '@company/contracts';
import { PROCUREMENT_ERROR_CODES } from '@company/constants';
import { type Db, orderError } from '../mysql-purchase-order.shared.js';
import { type ReadRow, date, nullableText, slots, text } from './receipt-read.shared.js';

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
    "allocation.disposition='return'",
    "allocation.return_reason='quality'",
    "((line.current_round_id=allocation.round_id AND round.status='finalized') OR supplier_return.id IS NOT NULL)",
  ];
  const params = [purchaseOrderLineId];
  if (query.receiptLineId) {
    filters.push('line.id=?');
    params.push(query.receiptLineId);
  }
  if (query.allocationId) {
    filters.push('allocation.id=?');
    params.push(query.allocationId);
  }
  if (query.keyword) {
    filters.push(
      '(receipt.receipt_no LIKE ? OR line.supplier_batch_code LIKE ? OR supplier_return.return_no LIKE ?)',
    );
    const keyword = `%${query.keyword}%`;
    params.push(keyword, keyword, keyword);
  }
  const from = `FROM procurement_receipt_allocation allocation
    JOIN procurement_receipt_line line ON line.id=allocation.receipt_line_id
    JOIN procurement_receipt receipt ON receipt.id=line.receipt_id
    JOIN procurement_receipt_round round ON round.id=allocation.round_id
    JOIN procurement_order source_order ON source_order.id=line.purchase_order_id
    LEFT JOIN procurement_order_line allocation_owner ON allocation_owner.id=allocation.purchase_order_line_id
    LEFT JOIN procurement_order allocation_order ON allocation_order.id=allocation_owner.purchase_order_id
    LEFT JOIN procurement_supplier_return supplier_return ON supplier_return.allocation_id=allocation.id
      AND supplier_return.reason_type='quality'
    WHERE ${filters.join(' AND ')}`;
  const [[count]] = await db.query<ReadRow[]>(`SELECT COUNT(*) total ${from}`, params);
  const [rows] = await db.query<ReadRow[]>(
    `SELECT allocation.id allocation_id,allocation.quantity allocation_quantity,
      allocation.purchase_order_line_id allocation_purchase_order_line_id,
      line.id receipt_line_id,line.purchase_order_line_id source_purchase_order_line_id,
      line.receipt_id,line.line_no receipt_line_no,line.supplier_batch_code,
      receipt.receipt_no,receipt.received_at,source_order.purchase_no source_purchase_no,
      allocation_order.purchase_no allocation_purchase_no,
      (line.current_round_id=allocation.round_id AND round.status='finalized') is_current,
      COALESCE(supplier_return.returned_quantity,0) returned_quantity,supplier_return.return_no
      ${from}
      ORDER BY receipt.received_at DESC,line.id DESC,allocation.id DESC LIMIT ? OFFSET ?`,
    [...params, query.pageSize, (query.page - 1) * query.pageSize],
  );
  const ids = rows.map((row) => text(row.allocation_id));
  const linked = new Map<string, PurchaseQualityReplacementCandidate['linkedSupplements']>();
  if (ids.length) {
    const [summaries] = await db.query<ReadRow[]>(
      `SELECT line.origin_allocation_id allocation_id,orders.status,COUNT(*) line_count,
        SUM(line.planned_quantity) planned_quantity
        FROM procurement_order_line line JOIN procurement_order orders ON orders.id=line.purchase_order_id
        WHERE line.origin_allocation_id IN (${slots(ids)})
        GROUP BY line.origin_allocation_id,orders.status
        ORDER BY line.origin_allocation_id,orders.status`,
      ids,
    );
    for (const row of summaries) {
      const id = text(row.allocation_id);
      linked.set(id, [
        ...(linked.get(id) ?? []),
        {
          status: row.status as PurchaseOrderStatus,
          count: Number(row.line_count),
          plannedQuantity: text(row.planned_quantity),
        },
      ]);
    }
  }
  return {
    items: rows.map((row) => {
      const isCurrent = Number(row.is_current) === 1;
      const returnedQuantity = Number(row.returned_quantity);
      return {
        allocationId: text(row.allocation_id),
        receiptLineId: text(row.receipt_line_id),
        receiptId: text(row.receipt_id),
        receiptNo: text(row.receipt_no),
        receiptLineNo: Number(row.receipt_line_no),
        receivedAt: date(row.received_at),
        supplierBatchCode: nullableText(row.supplier_batch_code),
        sourcePurchaseOrderLineId: text(row.source_purchase_order_line_id),
        sourcePurchaseNo: text(row.source_purchase_no),
        allocationPurchaseOrderLineId: nullableText(row.allocation_purchase_order_line_id),
        allocationPurchaseNo: nullableText(row.allocation_purchase_no),
        allocationQuantity: text(row.allocation_quantity),
        pendingReturnQuantity: String(
          isCurrent ? Math.max(0, Number(row.allocation_quantity) - returnedQuantity) : 0,
        ),
        returnedQuantity: String(returnedQuantity),
        returnNo: nullableText(row.return_no),
        isCurrent,
        linkedSupplements: linked.get(text(row.allocation_id)) ?? [],
      };
    }),
    total: Number(count.total),
    page: query.page,
    pageSize: query.pageSize,
  };
}
