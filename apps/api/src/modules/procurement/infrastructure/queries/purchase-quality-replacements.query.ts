import type {
  PageResult,
  PurchaseQualityReplacementCandidate,
  PurchaseQualityReplacementCandidateQuery,
} from '@company/contracts';
import { PROCUREMENT_ERROR_CODES } from '@company/constants';
import { type Db, orderError } from '../mysql-purchase-order.shared.js';
import {
  type ReadRow,
  date,
  nullableText,
  readCurrentRounds,
  text,
} from './receipt-read.shared.js';
import { readReceiptQuantitySummaries } from './receipt-quantities.query.js';
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
  // 质量原因聚合只判断候选资格；展示数量另取整次到货的共用投影。
  const from = `FROM procurement_receipt_line line
    JOIN procurement_receipt receipt ON receipt.id=line.receipt_id
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
      receipt.receipt_no,receipt.received_at
      ${from}
      ORDER BY receipt.received_at DESC,line.id DESC LIMIT ? OFFSET ?`,
    [...params, query.pageSize, (query.page - 1) * query.pageSize],
  );
  const ids = rows.map((row) => text(row.receipt_line_id));
  const quantities = await readReceiptQuantitySummaries(db, ids, await readCurrentRounds(db, ids));
  const linked = await readReceiptLinkedSupplements(db, ids, 'quality_replacement');
  return {
    items: rows.map((row) => {
      const receiptLineId = text(row.receipt_line_id);
      const summary = quantities.get(receiptLineId);
      if (!summary) throw new Error('到货明细缺少数量投影');
      return {
        receiptLineId,
        receiptId: text(row.receipt_id),
        receiptNo: text(row.receipt_no),
        receivedAt: date(row.received_at),
        supplierBatchCode: nullableText(row.supplier_batch_code),
        receivedQuantity: summary.receivedQuantity,
        pendingInboundQuantity: summary.pendingInboundQuantity,
        inboundQuantity: summary.inboundQuantity,
        pendingReturnQuantity: summary.pendingReturnQuantity,
        returnedQuantity: summary.returnedQuantity,
        receiptLinkedSupplements: linked.get(receiptLineId) ?? [],
      };
    }),
    total: Number(count.total),
    page: query.page,
    pageSize: query.pageSize,
  };
}
