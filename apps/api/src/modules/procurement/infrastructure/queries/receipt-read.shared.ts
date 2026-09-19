import type { RowDataPacket } from 'mysql2/promise';
import type {
  ProcurementReceiptItem,
  ReceiptRevisionItem,
  ReceiptScopeItem,
  SupplierReturnItem,
  ReceiptInboundHistoryItem,
  PageQuery,
} from '@company/contracts';
import { toBeijingISOString } from '../../../../common/time/date-time.js';

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
export const receiptSelect = (columns: string) =>
  `SELECT ${columns} FROM procurement_receipt r JOIN purchase_order po ON po.id=r.purchase_order_id JOIN procurement_supplier supplier ON supplier.id=po.supplier_id`;
export const RECEIPT_COLUMNS = `r.id,r.receipt_no,r.purchase_order_id,po.purchase_no,po.supplier_id,supplier.supplier_name,r.received_at,r.handover_evidence,r.remark,r.created_at`;
export const lineSelect = (columns: string) => `SELECT ${columns} FROM procurement_receipt_line line
  JOIN procurement_receipt r ON r.id=line.receipt_id
  JOIN purchase_order po ON po.id=line.purchase_order_id
  JOIN purchase_order_line pol ON pol.id=line.purchase_order_line_id
  JOIN procurement_supplier supplier ON supplier.id=po.supplier_id
  JOIN materials material ON material.id=line.item_id
  LEFT JOIN item_batch batch ON batch.id=line.batch_id`;
export const LINE_COLUMNS = `line.id,line.receipt_id,line.purchase_order_id,line.purchase_order_line_id,line.line_no,
  line.item_id,pol.item_code_snapshot,material.material_name,line.material_variant_id,pol.material_variant_code_snapshot,
  pol.unit_snapshot,line.supplier_batch_code,line.current_receipt_revision_id,line.batch_id,batch.batch_code,
  line.over_receipt_note,line.version,r.receipt_no,po.purchase_no,po.supplier_id,supplier.supplier_name`;
export const inboundFactSelect = (
  columns: string,
) => `SELECT ${columns} FROM inbound_detail detail JOIN inbound_order inbound ON inbound.id=detail.inbound_id
  JOIN inventory_transaction tx ON tx.reference_type='inbound_detail' AND tx.reference_detail_id=detail.id
    AND tx.transaction_type='purchase_inbound' AND tx.quantity=detail.inbound_number AND tx.quantity>0
    AND tx.batch_id=detail.batch_id AND tx.item_id=detail.item_id AND tx.material_variant_id=detail.material_variant_id
    AND tx.unit_snapshot=detail.unit_snapshot AND tx.stock_status=detail.stock_status
  WHERE inbound.source_type='purchased' AND inbound.status='completed' AND detail.stock_status='available'`;
export const INBOUND_FACT_COLUMNS = `inbound.id inbound_id,inbound.inbound_no,detail.id inbound_detail_id,tx.id transaction_id,
  detail.procurement_receipt_line_id receipt_line_id,detail.procurement_scope_id scope_id,
  detail.procurement_inspection_id inspection_id,detail.procurement_receipt_revision_id receipt_revision_id,
  tx.quantity,inbound.inbound_at`;
export function mapReceipt(row: ReadRow): ProcurementReceiptItem {
  return {
    id: text(row.id),
    receiptNo: text(row.receipt_no),
    purchaseOrderId: text(row.purchase_order_id),
    purchaseNo: text(row.purchase_no),
    supplierId: text(row.supplier_id),
    supplierName: text(row.supplier_name),
    receivedAt: date(row.received_at),
    handoverEvidence: text(row.handover_evidence),
    remark: nullableText(row.remark),
    createdAt: date(row.created_at),
    lineCount: Number(row.line_count),
  };
}
export function mapRevision(row: ReadRow): ReceiptRevisionItem {
  return {
    id: text(row.id),
    receiptLineId: text(row.receipt_line_id),
    revisionNo: Number(row.revision_no),
    previousRevisionId: nullableText(row.previous_revision_id),
    receivedQuantity: text(row.received_quantity),
    reason: text(row.reason),
    physicalIdentityConfirmed: Number(row.physical_identity_confirmed) === 1,
    createdBy: text(row.created_by),
    createdAt: date(row.created_at),
  };
}
export function mapScope(row: ReadRow): ReceiptScopeItem {
  return {
    id: text(row.id),
    receiptLineId: text(row.receipt_line_id),
    receiptRevisionId: text(row.receipt_revision_id),
    parentScopeId: nullableText(row.parent_scope_id),
    quantity: text(row.quantity),
    disposition: row.disposition as ReceiptScopeItem['disposition'],
    transitionType: row.transition_type as ReceiptScopeItem['transitionType'],
    inspectionId: nullableText(row.inspection_id),
    reviewCaseId: nullableText(row.review_case_id),
    terminationRootScopeId: nullableText(row.termination_root_scope_id),
    terminationReason: nullableText(row.termination_reason),
    version: Number(row.version),
    createdAt: date(row.created_at),
  };
}
export function mapReturn(row: ReadRow): SupplierReturnItem {
  return {
    id: text(row.id),
    returnNo: text(row.return_no),
    receiptLineId: text(row.receipt_line_id),
    receiptRevisionId: text(row.receipt_revision_id),
    scopeId: text(row.scope_id),
    inspectionId: nullableText(row.inspection_id),
    reasonType: row.reason_type as SupplierReturnItem['reasonType'],
    returnedQuantity: text(row.returned_quantity),
    returnedAt: date(row.returned_at),
    handoverEvidence: text(row.handover_evidence),
    remark: nullableText(row.remark),
    createdBy: text(row.created_by),
    createdAt: date(row.created_at),
  };
}
export function mapInbound(row: ReadRow): ReceiptInboundHistoryItem {
  return {
    inboundId: text(row.inbound_id),
    inboundNo: text(row.inbound_no),
    inboundDetailId: text(row.inbound_detail_id),
    transactionId: text(row.transaction_id),
    scopeId: text(row.scope_id),
    inspectionId: text(row.inspection_id),
    receiptRevisionId: text(row.receipt_revision_id),
    quantity: text(row.quantity),
    confirmedAt: date(row.inbound_at),
  };
}
