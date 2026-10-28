import { PROCUREMENT_RECEIPT_MAX_LINES } from '@company/constants';
import type {
  PageQuery,
  PageResult,
  ProcurementReceiptPurchaseOrderQuery,
  ProcurementReceiptPurchaseOrderItem,
  ProcurementReceiptPurchaseOrderReceiptPage,
  ProcurementReceiptWorklistLines,
  ProcurementReceiptLineLocation,
} from '@company/contracts';
import { ProcurementDomainError } from '../../domain/procurement.errors.js';
import type { Db } from '../mysql-purchase-order.shared.js';
import { readReceiptSummary } from './receipt-lines.query.js';
import { readReceiptQuantitySummaries } from './receipt-quantities.query.js';
import {
  type ReadRow,
  RECEIPT_COLUMNS,
  RECEIPT_LIST_SOURCE_COLUMNS,
  receiptSelect,
  lineSelect,
  readCurrentRounds,
  mapReceipt,
  mapReceiptListSource,
  mapRound,
  pageInput,
  slots,
  text,
  nullableText,
  date,
} from './receipt-read.shared.js';

const PURCHASE_ORDER_COLUMNS = `po.id,po.purchase_no,po.supplier_id,supplier.supplier_name,
  po.status,po.created_at,po.ordered_at,po.remark`;
const purchaseOrderSelect = (columns: string): string => `SELECT ${columns}
  FROM procurement_order po JOIN procurement_supplier supplier ON supplier.id=po.supplier_id`;
const HAS_RECEIPT = 'EXISTS(SELECT 1 FROM procurement_receipt r WHERE r.purchase_order_id=po.id)';

function filters(query: ProcurementReceiptPurchaseOrderQuery) {
  const where: string[] = [];
  const params: Array<string | number> = [];
  if (query.supplierId) {
    where.push('po.supplier_id=?');
    params.push(query.supplierId);
  }
  const keyword = query.keyword?.trim();
  if (!keyword && query.awaitingAcceptance !== 'yes') {
    where.push(HAS_RECEIPT);
    return { where, params };
  }
  const sourceWhere = ['r.purchase_order_id=po.id'];
  if (keyword) {
    sourceWhere.push(`(r.receipt_no LIKE ? OR po.purchase_no LIKE ? OR supplier.supplier_name LIKE ?
      OR material.material_name LIKE ? OR pol.item_code_snapshot LIKE ? OR pol.material_variant_code_snapshot LIKE ?)`);
    params.push(...Array<string>(6).fill(`%${keyword}%`));
  }
  if (query.awaitingAcceptance === 'yes') {
    sourceWhere.push('r.is_voided=0', "current_round.status='awaiting_acceptance'");
  }
  const sourceSelect = keyword
    ? `SELECT 1 FROM procurement_receipt r
      JOIN procurement_receipt_line line ON line.receipt_id=r.id
      JOIN procurement_order_line pol ON pol.id=line.purchase_order_line_id
      JOIN materials material ON material.id=line.item_id`
    : `SELECT 1 FROM procurement_receipt r JOIN procurement_receipt_line line ON line.receipt_id=r.id`;
  const roundJoin =
    query.awaitingAcceptance === 'yes'
      ? 'JOIN procurement_receipt_round current_round ON current_round.id=line.current_round_id AND current_round.receipt_line_id=line.id'
      : '';
  // Keyword and pending-stage eligibility must refer to the same actual receipt line.
  where.push(`EXISTS(${sourceSelect} ${roundJoin} WHERE ${sourceWhere.join(' AND ')})`);
  return { where, params };
}

interface PurchaseOrderCounts {
  receiptCount: number;
  awaitingAcceptanceCount: number;
}

/** Only aggregate the already selected parent page, never all purchase parents. */
async function readPurchaseOrderCounts(
  db: Db,
  ids: string[],
): Promise<Map<string, PurchaseOrderCounts>> {
  const result = new Map(ids.map((id) => [id, { receiptCount: 0, awaitingAcceptanceCount: 0 }]));
  if (!ids.length) return result;
  const [receipts] = await db.query<ReadRow[]>(
    `SELECT purchase_order_id,COUNT(*) receipt_count FROM procurement_receipt
    WHERE purchase_order_id IN (${slots(ids)}) GROUP BY purchase_order_id`,
    ids,
  );
  const [pending] = await db.query<ReadRow[]>(
    `SELECT r.purchase_order_id,COUNT(*) awaiting_acceptance_count FROM procurement_receipt r
    JOIN procurement_receipt_line line ON line.receipt_id=r.id
    JOIN procurement_receipt_round current_round
      ON current_round.id=line.current_round_id AND current_round.receipt_line_id=line.id
    WHERE r.purchase_order_id IN (${slots(ids)}) AND r.is_voided=0
      AND current_round.status='awaiting_acceptance' GROUP BY r.purchase_order_id`,
    ids,
  );
  for (const row of receipts)
    result.get(text(row.purchase_order_id))!.receiptCount = Number(row.receipt_count);
  for (const row of pending)
    result.get(text(row.purchase_order_id))!.awaitingAcceptanceCount = Number(
      row.awaiting_acceptance_count,
    );
  return result;
}

function mapPurchaseOrder(
  row: ReadRow,
  counts: PurchaseOrderCounts,
): ProcurementReceiptPurchaseOrderItem {
  return {
    id: text(row.id),
    purchaseNo: text(row.purchase_no),
    supplierId: text(row.supplier_id),
    supplierName: text(row.supplier_name),
    status: row.status as ProcurementReceiptPurchaseOrderItem['status'],
    ...counts,
    createdAt: date(row.created_at),
    orderedAt: row.ordered_at === null ? null : date(row.ordered_at),
    remark: nullableText(row.remark),
  };
}

export async function listReceiptPurchaseOrders(
  db: Db,
  query: ProcurementReceiptPurchaseOrderQuery,
): Promise<PageResult<ProcurementReceiptPurchaseOrderItem>> {
  const { page, pageSize } = pageInput(query);
  const { where, params } = filters(query);
  const [[count]] = await db.query<ReadRow[]>(
    `${purchaseOrderSelect('COUNT(*) total')} WHERE ${where.join(' AND ')}`,
    params,
  );
  const [rows] = await db.query<ReadRow[]>(
    `${purchaseOrderSelect(PURCHASE_ORDER_COLUMNS)} WHERE ${where.join(' AND ')}
    ORDER BY po.created_at DESC,po.id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  const counts = await readPurchaseOrderCounts(
    db,
    rows.map((row) => text(row.id)),
  );
  return {
    items: rows.map((row) => mapPurchaseOrder(row, counts.get(text(row.id))!)),
    total: Number(count?.total ?? 0),
    page,
    pageSize,
  };
}

export async function readReceiptPurchaseOrder(
  db: Db,
  id: string,
): Promise<ProcurementReceiptPurchaseOrderItem> {
  const [[row]] = await db.query<ReadRow[]>(
    `${purchaseOrderSelect(PURCHASE_ORDER_COLUMNS)} WHERE po.id=? AND ${HAS_RECEIPT}`,
    [id],
  );
  if (!row) throw new ProcurementDomainError('RECEIPT_NOT_FOUND', '该采购单没有到货登记');
  const counts = await readPurchaseOrderCounts(db, [id]);
  return mapPurchaseOrder(row, counts.get(id)!);
}

export async function listPurchaseOrderReceipts(
  db: Db,
  id: string,
  query: PageQuery,
): Promise<ProcurementReceiptPurchaseOrderReceiptPage> {
  const purchaseOrder = await readReceiptPurchaseOrder(db, id);
  const { page, pageSize } = pageInput(query);
  const [rows] = await db.query<ReadRow[]>(
    `${receiptSelect(RECEIPT_COLUMNS)} WHERE r.purchase_order_id=?
    ORDER BY r.received_at DESC,r.id DESC LIMIT ? OFFSET ?`,
    [id, pageSize, (page - 1) * pageSize],
  );
  return {
    purchaseOrder,
    items: rows.map(mapReceipt),
    total: purchaseOrder.receiptCount,
    page,
    pageSize,
  };
}

export async function readReceiptWorklistLines(
  db: Db,
  id: string,
): Promise<ProcurementReceiptWorklistLines> {
  const receipt = await readReceiptSummary(db, id);
  const [rows] = await db.query<ReadRow[]>(
    `${lineSelect(RECEIPT_LIST_SOURCE_COLUMNS + ',line.id,line.supplier_batch_code')}
    WHERE line.receipt_id=? ORDER BY line.line_no,line.id LIMIT ?`,
    [id, PROCUREMENT_RECEIPT_MAX_LINES + 1],
  );
  if (rows.length > PROCUREMENT_RECEIPT_MAX_LINES)
    throw new ProcurementDomainError('RECEIPT_STATE', '到货明细超过单据读取上限，请联系管理员核对');
  const ids = rows.map((row) => text(row.id));
  const rounds = await readCurrentRounds(db, ids);
  const quantities = await readReceiptQuantitySummaries(db, ids, rounds);
  return {
    receipt,
    items: rows.map((row) => {
      const lineId = text(row.id);
      const round = rounds.get(lineId);
      const summary = quantities.get(lineId);
      if (!round || !summary) throw new Error('到货明细缺少当前轮次或数量投影');
      return {
        ...mapReceiptListSource(row),
        id: lineId,
        supplierBatchCode: nullableText(row.supplier_batch_code),
        currentRound: mapRound(round),
        quantities: summary,
      };
    }),
  };
}

export async function locateReceiptLine(
  db: Db,
  id: string,
): Promise<ProcurementReceiptLineLocation> {
  const [[row]] = await db.query<ReadRow[]>(
    'SELECT id,receipt_id,purchase_order_id FROM procurement_receipt_line WHERE id=?',
    [id],
  );
  if (!row) throw new ProcurementDomainError('RECEIPT_NOT_FOUND', '到货明细不存在');
  return {
    purchaseOrderId: text(row.purchase_order_id),
    receiptId: text(row.receipt_id),
    receiptLineId: text(row.id),
  };
}
