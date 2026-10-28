import { PROCUREMENT_RECEIPT_MAX_LINES } from '@company/constants';
import type {
  PageQuery,
  PageResult,
  QualityIncomingInspectionLocation,
  QualityIncomingInspectionOrderItem,
  QualityIncomingInspectionOrderQuery,
  QualityIncomingInspectionOrderReceiptPage,
  QualityIncomingInspectionOrderReference,
  QualityIncomingInspectionReceiptCandidateQuery,
  QualityIncomingInspectionReceiptItem,
  QualityIncomingInspectionReceiptLines,
} from '@company/contracts';
import { QualityCommandError } from '../../../quality/public.js';
import { ProcurementDomainError } from '../../domain/procurement.errors.js';
import type { Db } from '../mysql-purchase-order.shared.js';
import {
  readInspectionWorklistRows,
  receiptInspectionStage,
} from './receipt-inspection-worklist.query.js';
import { receiptUnprocessedQuantityForLine } from './receipt-quantities.query.js';
import {
  type ReadRow,
  RECEIPT_VOID_COLUMNS,
  date,
  mapReceiptVoid,
  nullableText,
  pageInput,
  text,
} from './receipt-read.shared.js';

const ORDER_COLUMNS =
  'o.id,o.inspection_no,o.remark,o.created_by,o.created_at,o.updated_by,o.updated_at,o.version';
const orderSelect = (columns: string) =>
  `SELECT ${columns} FROM quality_incoming_inspection_order o`;
const receiptSelect = (columns: string) => `SELECT ${columns} FROM procurement_receipt r
  JOIN procurement_order po ON po.id=r.purchase_order_id
  JOIN procurement_supplier supplier ON supplier.id=po.supplier_id
  LEFT JOIN quality_incoming_inspection_order_receipt link ON link.receipt_id=r.id
  LEFT JOIN quality_incoming_inspection_order o ON o.id=link.inspection_order_id`;
const RECEIPT_COLUMNS = `r.id receipt_id,r.receipt_no,r.purchase_order_id,po.purchase_no,po.supplier_id,supplier.supplier_name,r.received_at,
  ${RECEIPT_VOID_COLUMNS},o.id order_id,o.inspection_no,o.version order_version,
  (SELECT COUNT(*) FROM procurement_receipt_line counted_line WHERE counted_line.receipt_id=r.id) line_count`;
const sourceSelect = (
  columns: string,
) => `SELECT ${columns} FROM quality_incoming_inspection_order_receipt search_link
  JOIN procurement_receipt r ON r.id=search_link.receipt_id
  JOIN procurement_order po ON po.id=r.purchase_order_id
  JOIN procurement_receipt_line line ON line.receipt_id=r.id
  JOIN procurement_order_line pol ON pol.id=line.purchase_order_line_id
  JOIN procurement_supplier supplier ON supplier.id=po.supplier_id
  JOIN materials material ON material.id=line.item_id`;
const stageSourceSelect = (withSupplier: boolean) => `SELECT 1
  FROM quality_incoming_inspection_order_receipt search_link
  JOIN procurement_receipt r ON r.id=search_link.receipt_id
  JOIN procurement_receipt_line line ON line.receipt_id=r.id
  JOIN procurement_receipt_round current_round ON current_round.id=line.current_round_id AND current_round.receipt_line_id=line.id
  ${withSupplier ? 'JOIN procurement_order po ON po.id=r.purchase_order_id' : ''}`;
const SOURCE_KEYWORD = `(r.receipt_no LIKE ? OR po.purchase_no LIKE ? OR supplier.supplier_name LIKE ?
  OR material.material_name LIKE ? OR pol.item_code_snapshot LIKE ? OR pol.material_variant_code_snapshot LIKE ?)`;
const CANDIDATE_KEYWORD_LINES = `SELECT 1 FROM procurement_receipt_line search_line
  JOIN procurement_order_line search_order_line ON search_order_line.id=search_line.purchase_order_line_id
  JOIN procurement_order search_order ON search_order.id=search_order_line.purchase_order_id
  JOIN procurement_supplier search_supplier ON search_supplier.id=search_order.supplier_id
  JOIN materials search_material ON search_material.id=search_line.item_id
  WHERE search_line.receipt_id=r.id AND (search_supplier.supplier_name LIKE ? OR search_material.material_name LIKE ?
    OR search_order_line.item_code_snapshot LIKE ? OR search_order_line.material_variant_code_snapshot LIKE ?)`;

export async function listIncomingInspectionOrders(
  db: Db,
  query: QualityIncomingInspectionOrderQuery,
): Promise<PageResult<QualityIncomingInspectionOrderItem>> {
  const { page, pageSize } = pageInput(query);
  const where: string[] = ['1=1'];
  const params: Array<string | number> = [];
  if (query.keyword?.trim()) {
    where.push(`(o.inspection_no LIKE ? OR EXISTS(${sourceSelect('1')}
      WHERE search_link.inspection_order_id=o.id AND ${SOURCE_KEYWORD}))`);
    params.push(...Array<string>(7).fill(`%${query.keyword.trim()}%`));
  }
  if (query.stage || query.supplierId) {
    const sourceWhere = ['search_link.inspection_order_id=o.id'];
    if (query.supplierId) {
      sourceWhere.push('po.supplier_id=?');
      params.push(query.supplierId);
    }
    if (query.stage) {
      sourceWhere.push(`${receiptInspectionStage(receiptUnprocessedQuantityForLine())}=?`);
      params.push(query.stage);
    }
    where.push(
      `EXISTS(${stageSourceSelect(Boolean(query.supplierId))} WHERE ${sourceWhere.join(' AND ')})`,
    );
  }
  const [[count]] = await db.query<ReadRow[]>(
    `${orderSelect('COUNT(*) total')} WHERE ${where.join(' AND ')}`,
    params,
  );
  const [rows] = await db.query<ReadRow[]>(
    `${orderSelect(ORDER_COLUMNS)} WHERE ${where.join(' AND ')} ORDER BY o.created_at DESC,o.id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  return { items: rows.map(mapOrder), total: Number(count?.total ?? 0), page, pageSize };
}

export async function readIncomingInspectionOrder(
  db: Db,
  id: string,
): Promise<QualityIncomingInspectionOrderItem> {
  const [[row]] = await db.query<ReadRow[]>(`${orderSelect(ORDER_COLUMNS)} WHERE o.id=?`, [id]);
  if (!row) throw new QualityCommandError('NOT_FOUND', '质检主单不存在');
  return mapOrder(row);
}

export async function listIncomingInspectionOrderReceipts(
  db: Db,
  id: string,
  query: PageQuery,
): Promise<QualityIncomingInspectionOrderReceiptPage> {
  const order = await readIncomingInspectionOrder(db, id);
  const { page, pageSize } = pageInput(query);
  const [[count]] = await db.query<ReadRow[]>(
    'SELECT COUNT(*) total FROM quality_incoming_inspection_order_receipt WHERE inspection_order_id=?',
    [id],
  );
  // The composite key supplies receipt_id DESC within this one order, independently of the parent page.
  const [rows] = await db.query<ReadRow[]>(
    `${receiptSelect(RECEIPT_COLUMNS)} WHERE link.inspection_order_id=? ORDER BY link.receipt_id DESC LIMIT ? OFFSET ?`,
    [id, pageSize, (page - 1) * pageSize],
  );
  return {
    order,
    items: mapReceipts(rows),
    total: Number(count?.total ?? 0),
    page,
    pageSize,
  };
}

export async function listIncomingInspectionReceiptCandidates(
  db: Db,
  query: QualityIncomingInspectionReceiptCandidateQuery,
): Promise<PageResult<QualityIncomingInspectionReceiptItem>> {
  const { page, pageSize } = pageInput(query);
  const where = ['(r.is_voided=0 OR link.inspection_order_id IS NOT NULL)'];
  const params: Array<string | number> = [];
  const association = query.association ?? 'unassigned';
  if (association === 'unassigned') where.push('link.inspection_order_id IS NULL');
  if (association === 'assigned') where.push('link.inspection_order_id IS NOT NULL');
  if (query.keyword?.trim()) {
    where.push(
      `(r.receipt_no LIKE ? OR po.purchase_no LIKE ? OR o.inspection_no LIKE ? OR EXISTS(${CANDIDATE_KEYWORD_LINES}))`,
    );
    params.push(...Array<string>(7).fill(`%${query.keyword.trim()}%`));
  }
  const [[count]] = await db.query<ReadRow[]>(
    `${receiptSelect('COUNT(*) total')} WHERE ${where.join(' AND ')}`,
    params,
  );
  const [rows] = await db.query<ReadRow[]>(
    `${receiptSelect(RECEIPT_COLUMNS)} WHERE ${where.join(' AND ')} ORDER BY r.id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  return { items: mapReceipts(rows), total: Number(count?.total ?? 0), page, pageSize };
}

export async function readIncomingInspectionReceiptLines(
  db: Db,
  receiptId: string,
): Promise<QualityIncomingInspectionReceiptLines> {
  const [[row]] = await db.query<ReadRow[]>(`${receiptSelect(RECEIPT_COLUMNS)} WHERE r.id=?`, [
    receiptId,
  ]);
  if (!row) throw new ProcurementDomainError('RECEIPT_NOT_FOUND', '到货单不存在');
  const [lineRows] = await db.query<ReadRow[]>(
    'SELECT id FROM procurement_receipt_line WHERE receipt_id=? ORDER BY line_no,id LIMIT ?',
    [receiptId, PROCUREMENT_RECEIPT_MAX_LINES + 1],
  );
  if (lineRows.length > PROCUREMENT_RECEIPT_MAX_LINES)
    throw new QualityCommandError('INVALID_STATE', '到货明细超过单据读取上限，请联系管理员核对');
  const ids = lineRows.map((line) => text(line.id));
  const lines = await readInspectionWorklistRows(db, ids);
  return {
    receipt: mapReceipts([row])[0]!,
    items: ids.map((id) => {
      const item = lines.get(id);
      if (!item) throw new Error('到货明细缺少当前检验投影');
      return item;
    }),
  };
}

export async function locateIncomingInspectionLine(
  db: Db,
  receiptLineId: string,
): Promise<QualityIncomingInspectionLocation> {
  const [[row]] = await db.query<ReadRow[]>(
    `SELECT line.receipt_id,o.id order_id,o.inspection_no,o.version order_version
    FROM procurement_receipt_line line
    LEFT JOIN quality_incoming_inspection_order_receipt link ON link.receipt_id=line.receipt_id
    LEFT JOIN quality_incoming_inspection_order o ON o.id=link.inspection_order_id
    WHERE line.id=?`,
    [receiptLineId],
  );
  if (!row) throw new ProcurementDomainError('RECEIPT_NOT_FOUND', '到货明细不存在');
  return { receiptLineId, receiptId: text(row.receipt_id), order: mapOrderReference(row) };
}

function mapOrder(row: ReadRow): QualityIncomingInspectionOrderItem {
  return {
    id: text(row.id),
    inspectionNo: text(row.inspection_no),
    remark: nullableText(row.remark),
    createdBy: text(row.created_by),
    createdAt: date(row.created_at),
    updatedBy: text(row.updated_by),
    updatedAt: date(row.updated_at),
    version: Number(row.version),
  };
}

function mapOrderReference(row: ReadRow): QualityIncomingInspectionOrderReference | null {
  return row.order_id == null
    ? null
    : {
        id: text(row.order_id),
        inspectionNo: text(row.inspection_no),
        version: Number(row.order_version),
      };
}

function mapReceipts(rows: ReadRow[]): QualityIncomingInspectionReceiptItem[] {
  return rows.map((row) => ({
    receiptId: text(row.receipt_id),
    receiptNo: text(row.receipt_no),
    purchaseOrderId: text(row.purchase_order_id),
    purchaseNo: text(row.purchase_no),
    supplierId: text(row.supplier_id),
    supplierName: text(row.supplier_name),
    receivedAt: date(row.received_at),
    lineCount: Number(row.line_count),
    void: mapReceiptVoid(row),
    order: mapOrderReference(row),
  }));
}
