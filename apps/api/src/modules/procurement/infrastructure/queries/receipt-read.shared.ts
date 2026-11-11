import type { Db } from '../mysql-purchase-order.shared.js';
import type { RowDataPacket } from 'mysql2/promise';
import type {
  ProcurementReceiptItem,
  ProcurementReceiptVoidItem,
  ReceiptInboundHistoryItem,
  PageQuery,
} from '@company/contracts';
import { toBeijingISOString } from '../../../../common/time/date-time.js';
import { ProcurementDomainError } from '../../domain/procurement.errors.js';
export type ReadRow = RowDataPacket & Record<string, string | number | Date | null>;
export const text = (value: unknown): string => String(value);
export const nullableText = (value: unknown): string | null =>
  value == null ? null : String(value);
export const date = (value: unknown): string => toBeijingISOString(value as Date);
export const pageInput = (query: PageQuery) => ({
  page: query.page ?? 1,
  pageSize: query.pageSize ?? 10,
});
export const slots = (ids: readonly string[]) => ids.map(() => '?').join(',');
export const RECEIPT_VOID_COLUMNS =
  'r.is_voided,r.void_reason,r.voided_by void_created_by,r.voided_at void_created_at';
export const RECEIPT_COLUMNS = `r.id,r.receipt_no,r.purchase_order_id,po.purchase_no,po.supplier_id,supplier.supplier_name,
  r.received_at,r.handover_evidence,r.remark,r.created_at,r.version,${RECEIPT_VOID_COLUMNS},
  (SELECT COUNT(*) FROM procurement_receipt_line counted WHERE counted.receipt_id=r.id) line_count`;
export const receiptSelect = (columns: string) =>
  `SELECT ${columns} FROM procurement_receipt r JOIN procurement_order po ON po.id=r.purchase_order_id JOIN procurement_supplier supplier ON supplier.id=po.supplier_id`;
export const LINE_COLUMNS = `line.id,line.receipt_id,line.purchase_order_id,line.purchase_order_line_id,pol.line_no purchase_order_line_no,
  line.item_id,pol.item_code_snapshot,material.material_name,line.material_variant_id,pol.material_variant_code_snapshot,
  pol.unit_snapshot,pol.planned_quantity,line.supplier_batch_code,line.version,r.receipt_no,r.received_at,po.purchase_no,po.supplier_id,supplier.supplier_name,
  ${RECEIPT_VOID_COLUMNS},
  (SELECT COUNT(*) FROM procurement_receipt_handling handling WHERE handling.receipt_line_id=line.id) handling_count,
  (SELECT handling.other_handling_note FROM procurement_receipt_handling handling WHERE handling.receipt_line_id=line.id ORDER BY handling.id DESC LIMIT 1) other_handling_note`;
export const lineSelect = (columns: string) => `SELECT ${columns} FROM procurement_receipt_line line
  JOIN procurement_order_line pol ON pol.id=line.purchase_order_line_id
  JOIN procurement_order po ON po.id=line.purchase_order_id
  JOIN procurement_supplier supplier ON supplier.id=po.supplier_id
  JOIN procurement_receipt r ON r.id=line.receipt_id
  JOIN materials material ON material.id=line.item_id`;
export const inboundFactSelect = (
  columns: string,
) => `SELECT ${columns} FROM inbound_detail detail JOIN inbound_order inbound ON inbound.id=detail.inbound_id
  JOIN inventory_transaction tx ON tx.reference_type='inbound_detail' AND tx.reference_detail_id=detail.id
    AND tx.transaction_type='purchase_inbound' AND tx.reversal_of_transaction_id IS NULL AND tx.quantity=detail.inbound_number AND tx.quantity>0
    AND tx.batch_id=detail.batch_id AND tx.item_id=detail.item_id AND tx.material_variant_id=detail.material_variant_id
    AND tx.unit_snapshot=detail.unit_snapshot AND tx.stock_status=detail.stock_status
  JOIN item_batch batch ON batch.id=detail.batch_id
  WHERE inbound.source_type='purchased' AND inbound.status='completed' AND detail.stock_status='available' AND detail.is_deleted=0`;
export const INBOUND_FACT_COLUMNS = `inbound.id inbound_id,inbound.inbound_no,detail.id inbound_detail_id,tx.id transaction_id,
  detail.procurement_receipt_line_id receipt_line_id,tx.quantity,detail.batch_id,batch.batch_code,inbound.inbound_at`;
export function mapReceiptVoid(row: ReadRow): ProcurementReceiptVoidItem | null {
  return Number(row.is_voided) !== 1
    ? null
    : {
        reason: text(row.void_reason),
        createdBy: text(row.void_created_by),
        createdAt: date(row.void_created_at),
      };
}
export function mapReceipt(row: ReadRow): ProcurementReceiptItem {
  return {
    id: text(row.id),
    receiptNo: text(row.receipt_no),
    purchaseOrderId: text(row.purchase_order_id),
    purchaseNo: text(row.purchase_no),
    supplierId: text(row.supplier_id),
    supplierName: text(row.supplier_name),
    receivedAt: date(row.received_at),
    handoverEvidence: nullableText(row.handover_evidence),
    remark: nullableText(row.remark),
    createdAt: date(row.created_at),
    version: Number(row.version),
    lineCount: Number(row.line_count),
    void: mapReceiptVoid(row),
  };
}
export function mapInbound(row: ReadRow): ReceiptInboundHistoryItem {
  return {
    inboundId: text(row.inbound_id),
    inboundNo: text(row.inbound_no),
    inboundDetailId: text(row.inbound_detail_id),
    transactionId: text(row.transaction_id),
    batchId: text(row.batch_id),
    batchCode: text(row.batch_code),
    quantity: text(row.quantity),
    confirmedAt: date(row.inbound_at),
  };
}
export async function readReceiptSummary(db: Db, id: string): Promise<ProcurementReceiptItem> {
  const [[row]] = await db.query<ReadRow[]>(`${receiptSelect(RECEIPT_COLUMNS)} WHERE r.id=?`, [id]);
  if (!row) throw new ProcurementDomainError('RECEIPT_NOT_FOUND', '到货登记不存在');
  return mapReceipt(row);
}
