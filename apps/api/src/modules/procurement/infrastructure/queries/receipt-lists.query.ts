import type {
  ProcurementInboundSourceQuery,
  ProcurementReceiptQuery,
  ProcurementReceiptItem,
  ProcurementInboundSourceItem,
  PageResult,
} from '@company/contracts';
import type { Db } from '../mysql-purchase-order.shared.js';
import {
  LINE_COLUMNS,
  receiptSelect,
  RECEIPT_COLUMNS,
  mapReceipt,
  lineSelect,
  pageInput,
  slots,
  date,
  type ReadRow,
} from './receipt-read.shared.js';
import { mapReceiptLines } from './receipt-lines.query.js';
export async function listInboundSources(
  db: Db,
  query: ProcurementInboundSourceQuery,
): Promise<PageResult<ProcurementInboundSourceItem>> {
  const page = pageInput(query),
    where = ['r.is_voided=0'],
    params: Array<string | number> = [];
  for (const [column, value] of [
    ['po.supplier_id', query.supplierId],
    ['po.id', query.purchaseOrderId],
    ['line.id', query.receiptLineId],
  ]) {
    if (value) {
      where.push(column + '=?');
      params.push(value);
    }
  }
  if (query.receiptLineIds?.length) {
    where.push(`line.id IN (${slots(query.receiptLineIds)})`);
    params.push(...query.receiptLineIds);
  }
  if (query.keyword?.trim()) {
    where.push(
      '(r.receipt_no LIKE ? OR po.purchase_no LIKE ? OR supplier.supplier_name LIKE ? OR material.material_name LIKE ? OR pol.item_code_snapshot LIKE ? OR pol.material_variant_code_snapshot LIKE ? OR line.supplier_batch_code LIKE ?)',
    );
    params.push(...Array<string>(7).fill('%' + query.keyword.trim() + '%'));
  }
  const [[count]] = await db.query<ReadRow[]>(
    `${lineSelect('COUNT(*) total')} WHERE ${where.join(' AND ')}`,
    params,
  );
  const [rows] = await db.query<ReadRow[]>(
    `${lineSelect(LINE_COLUMNS)} WHERE ${where.join(' AND ')} ORDER BY r.received_at DESC,line.id DESC LIMIT ? OFFSET ?`,
    [...params, page.pageSize, (page.page - 1) * page.pageSize],
  );
  const lines = await mapReceiptLines(db, rows);
  return {
    items: lines.map((line, index) => ({
      receiptLineId: line.id,
      receiptLineVersion: line.version,
      purchaseOrderLineId: line.purchaseOrderLineId,
      receiptId: line.receiptId,
      receiptNo: line.receiptNo,
      receiptReceivedAt: date(rows[index]!.received_at),
      receiptPurchaseNo: line.purchaseNo,
      purchaseOrderId: line.purchaseOrderId,
      purchaseNo: line.purchaseNo,
      supplierId: line.supplierId,
      supplierName: line.supplierName,
      itemId: line.itemId,
      itemCode: line.itemCode,
      itemName: line.itemName,
      materialVariantId: line.materialVariantId,
      materialVariantCode: line.materialVariantCode,
      unit: line.unit,
      plannedQuantity: line.plannedQuantity,
      supplierBatchCode: line.supplierBatchCode,
      inboundQuantity: line.quantities.inboundQuantity,
      handlingCount: line.handlingCount,
      otherHandlingNote: line.otherHandlingNote,
    })),
    total: Number(count?.total ?? 0),
    ...page,
  };
}

const receiptMaterialKeywordSelect = () => `SELECT 1 FROM procurement_receipt_line search_line
  JOIN procurement_order_line search_order_line ON search_order_line.id=search_line.purchase_order_line_id
  JOIN materials search_material ON search_material.id=search_line.item_id`;

export async function listReceipts(
  db: Db,
  query: ProcurementReceiptQuery,
): Promise<PageResult<ProcurementReceiptItem>> {
  const page = pageInput(query);
  const where: string[] = [];
  const params: Array<string | number> = [];
  if (query.supplierId) {
    where.push('po.supplier_id=?');
    params.push(query.supplierId);
  }
  if (query.purchaseOrderId) {
    where.push('r.purchase_order_id=?');
    params.push(query.purchaseOrderId);
  }
  const keyword = query.keyword?.trim();
  if (keyword) {
    where.push(`(r.receipt_no LIKE ? OR po.purchase_no LIKE ? OR supplier.supplier_name LIKE ? OR EXISTS(
      ${receiptMaterialKeywordSelect()}
      WHERE search_line.receipt_id=r.id AND (search_material.material_name LIKE ?
        OR search_order_line.item_code_snapshot LIKE ? OR search_order_line.material_variant_code_snapshot LIKE ?
        OR search_line.supplier_batch_code LIKE ?)))`);
    params.push(...Array<string>(7).fill(`%${keyword}%`));
  }
  const filter = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  const [[count]] = await db.query<ReadRow[]>(
    `${receiptSelect('COUNT(*) total')}${filter}`,
    params,
  );
  const [rows] = await db.query<ReadRow[]>(
    `${receiptSelect(RECEIPT_COLUMNS)}${filter} ORDER BY r.received_at DESC,r.id DESC LIMIT ? OFFSET ?`,
    [...params, page.pageSize, (page.page - 1) * page.pageSize],
  );
  return { items: rows.map(mapReceipt), total: Number(count?.total ?? 0), ...page };
}
