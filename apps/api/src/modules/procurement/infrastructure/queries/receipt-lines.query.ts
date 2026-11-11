import type {
  ProcurementReceiptLine,
  ProcurementReceiptWorklistLines,
  ProcurementReceiptLineLocation,
  ProcurementReceiptLineOverview,
  ReceiptLineStage,
} from '@company/contracts';
import type { Db } from '../mysql-purchase-order.shared.js';
import { ProcurementDomainError } from '../../domain/procurement.errors.js';
import {
  LINE_COLUMNS,
  lineSelect,
  mapReceiptVoid,
  text,
  nullableText,
  readReceiptSummary,
  type ReadRow,
} from './receipt-read.shared.js';
import { readReceiptQuantitySummaries } from './receipt-quantities.query.js';
export async function mapReceiptLines(db: Db, rows: ReadRow[]): Promise<ProcurementReceiptLine[]> {
  const quantities = await readReceiptQuantitySummaries(
    db,
    rows.map((row) => text(row.id)),
  );
  return rows.map((row) => {
    const summary = quantities.get(text(row.id)) ?? { inboundQuantity: '0' };
    const isVoided = Number(row.is_voided) === 1;
    const hasHandling = Number(row.handling_count) > 0 || BigInt(summary.inboundQuantity) > 0n;
    let stage: ReceiptLineStage = 'registered';
    if (isVoided) stage = 'voided';
    else if (hasHandling) stage = 'handled';
    return {
      id: text(row.id),
      receiptId: text(row.receipt_id),
      receiptNo: text(row.receipt_no),
      purchaseOrderId: text(row.purchase_order_id),
      purchaseNo: text(row.purchase_no),
      purchaseOrderLineId: text(row.purchase_order_line_id),
      purchaseOrderLineNo: Number(row.purchase_order_line_no),
      supplierId: text(row.supplier_id),
      supplierName: text(row.supplier_name),
      itemId: text(row.item_id),
      itemCode: text(row.item_code_snapshot),
      itemName: text(row.material_name),
      materialVariantId: text(row.material_variant_id),
      materialVariantCode: text(row.material_variant_code_snapshot),
      unit: text(row.unit_snapshot),
      plannedQuantity: text(row.planned_quantity),
      supplierBatchCode: nullableText(row.supplier_batch_code),
      version: Number(row.version),
      stage,
      quantities: summary,
      handlingCount: Number(row.handling_count),
      otherHandlingNote: nullableText(row.other_handling_note),
      void: mapReceiptVoid(row),
    };
  });
}
export async function readReceiptLine(db: Db, id: string): Promise<ProcurementReceiptLine> {
  const [rows] = await db.query<ReadRow[]>(`${lineSelect(LINE_COLUMNS)} WHERE line.id=?`, [id]);
  if (!rows.length) throw new ProcurementDomainError('RECEIPT_NOT_FOUND', '到货明细不存在');
  return (await mapReceiptLines(db, rows))[0]!;
}
export async function readReceiptLineOverviews(
  db: Db,
  id: string,
): Promise<ProcurementReceiptLineOverview[]> {
  const [rows] = await db.query<ReadRow[]>(
    `${lineSelect(LINE_COLUMNS)} WHERE line.receipt_id=? ORDER BY line.line_no,line.id`,
    [id],
  );
  if (rows.length > 100) throw new ProcurementDomainError('RECEIPT_STATE', '到货明细超过单据上限');
  return mapReceiptLines(db, rows);
}

export async function readReceiptWorklistLines(
  db: Db,
  id: string,
): Promise<ProcurementReceiptWorklistLines> {
  return {
    receipt: await readReceiptSummary(db, id),
    items: await readReceiptLineOverviews(db, id),
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
    receiptLineId: text(row.id),
    receiptId: text(row.receipt_id),
    purchaseOrderId: text(row.purchase_order_id),
  };
}
