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
  readCurrentRounds,
  text,
} from './receipt-read.shared.js';
import { allocationRemaining } from './receipt-allocation.query.js';
import { readReceiptQuantitySummaries } from './receipt-quantities.query.js';
import { readReceiptLinkedSupplements } from './purchase-supplement-summary.query.js';

const currentInboundReceiptSelect = () => `SELECT 1 FROM procurement_receipt_allocation allocation
  JOIN procurement_receipt_round round ON round.id=allocation.round_id AND round.receipt_line_id=line.id
  JOIN procurement_receipt_acceptance acceptance ON acceptance.id=allocation.acceptance_id
    AND acceptance.round_id=round.id AND acceptance.receipt_line_id=line.id
  JOIN quality_inspection_record inspection ON inspection.id=acceptance.inspection_record_id
    AND inspection.receipt_line_id=line.id AND inspection.id=round.inspection_id
  JOIN quality_inspection_case inspection_case ON inspection_case.id=inspection.case_id
    AND inspection_case.receipt_line_id=line.id AND inspection_case.status='completed'
  WHERE allocation.receipt_line_id=line.id AND line.current_round_id=round.id
    AND round.status='finalized' AND allocation.disposition='inbound'
    AND allocation.termination_reason IS NULL AND inspection.release_decision='released'
    AND acceptance.after_receipt_revision_id=line.current_receipt_revision_id
    AND (${allocationRemaining('allocation.id', 'allocation.quantity')})>0`;

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

  const filters = [
    'line.purchase_order_line_id=?',
    'receipt.is_voided=0',
    `(EXISTS(${currentInboundReceiptSelect()})
      OR EXISTS(${inboundFactSelect('1')} AND detail.procurement_receipt_line_id=line.id))`,
  ];
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
      receipt.receipt_no,receipt.received_at
      FROM procurement_receipt_line line
      JOIN procurement_receipt receipt ON receipt.id=line.receipt_id
      WHERE ${filter} ORDER BY receipt.received_at DESC,line.id DESC LIMIT ? OFFSET ?`,
    [...params, query.pageSize, (query.page - 1) * query.pageSize],
  );
  const ids = rows.map((row) => text(row.id));
  const quantities = await readReceiptQuantitySummaries(db, ids, await readCurrentRounds(db, ids));
  const linked = await readReceiptLinkedSupplements(db, ids, 'excess_purchase');
  return {
    items: rows.map((row) => {
      const id = text(row.id);
      const summary = quantities.get(id);
      if (!summary) throw new Error('到货明细缺少数量投影');
      return {
        id,
        receiptId: text(row.receipt_id),
        receiptNo: text(row.receipt_no),
        receivedAt: date(row.received_at),
        supplierBatchCode: nullableText(row.supplier_batch_code),
        receivedQuantity: summary.receivedQuantity,
        pendingInboundQuantity: summary.pendingInboundQuantity,
        inboundQuantity: summary.inboundQuantity,
        pendingReturnQuantity: summary.pendingReturnQuantity,
        returnedQuantity: summary.returnedQuantity,
        receiptLinkedSupplements: linked.get(id) ?? [],
      };
    }),
    total: Number(count.total),
    page: query.page,
    pageSize: query.pageSize,
  };
}
