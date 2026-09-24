import type { Db } from '../mysql-purchase-order.shared.js';
import type { RowDataPacket } from 'mysql2/promise';
import type {
  ProcurementReceiptItem,
  ProcurementSupplierSummary,
  ReceiptRevisionItem,
  ReceiptRoundItem,
  ReceiptAllocationItem,
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
  `SELECT ${columns} FROM procurement_receipt r JOIN procurement_order po ON po.id=r.purchase_order_id`;
export const RECEIPT_COLUMNS = `r.id,r.receipt_no,r.purchase_order_id,po.purchase_no,r.received_at,r.handover_evidence,r.remark,r.created_at,
  (SELECT COUNT(*) FROM procurement_receipt_line pending_line JOIN procurement_receipt_round pending_round ON pending_round.id=pending_line.current_round_id WHERE pending_line.receipt_id=r.id AND pending_round.status='awaiting_acceptance') awaiting_acceptance_count`;
export const lineSelect = (columns: string) => `SELECT ${columns} FROM procurement_receipt_line line
  JOIN procurement_receipt r ON r.id=line.receipt_id
  JOIN procurement_order po ON po.id=line.purchase_order_id
  JOIN procurement_order_line pol ON pol.id=line.purchase_order_line_id
  JOIN procurement_supplier supplier ON supplier.id=pol.supplier_id
  JOIN materials material ON material.id=line.item_id
  LEFT JOIN item_batch batch ON batch.id=line.batch_id`;
export const LINE_COLUMNS = `line.id,line.receipt_id,line.purchase_order_id,line.purchase_order_line_id,line.line_no,
  line.item_id,pol.item_code_snapshot,material.material_name,line.material_variant_id,pol.material_variant_code_snapshot,
  pol.unit_snapshot,line.supplier_batch_code,line.current_receipt_revision_id,line.batch_id,batch.batch_code,
  line.over_receipt_note,line.version,line.current_round_id,r.receipt_no,po.purchase_no,pol.supplier_id,supplier.supplier_name`;
export const inboundFactSelect = (
  columns: string,
) => `SELECT ${columns} FROM inbound_detail detail JOIN inbound_order inbound ON inbound.id=detail.inbound_id
  JOIN inventory_transaction tx ON tx.reference_type='inbound_detail' AND tx.reference_detail_id=detail.id
    AND tx.transaction_type='purchase_inbound' AND tx.quantity=detail.inbound_number AND tx.quantity>0
    AND tx.batch_id=detail.batch_id AND tx.item_id=detail.item_id AND tx.material_variant_id=detail.material_variant_id
    AND tx.unit_snapshot=detail.unit_snapshot AND tx.stock_status=detail.stock_status
  WHERE inbound.source_type='purchased' AND inbound.status='completed' AND detail.stock_status='available'`;
export const INBOUND_FACT_COLUMNS = `inbound.id inbound_id,inbound.inbound_no,detail.id inbound_detail_id,tx.id transaction_id,
  detail.procurement_receipt_line_id receipt_line_id,
  detail.procurement_allocation_id allocation_id,detail.procurement_inspection_id inspection_id,detail.procurement_receipt_revision_id receipt_revision_id,
  tx.quantity,inbound.inbound_at`;
export function mapReceipt(
  row: ReadRow,
  suppliers: ProcurementSupplierSummary[],
): ProcurementReceiptItem {
  return {
    id: text(row.id),
    receiptNo: text(row.receipt_no),
    awaitingAcceptanceCount: Number(row.awaiting_acceptance_count ?? 0),
    purchaseOrderId: text(row.purchase_order_id),
    purchaseNo: text(row.purchase_no),
    suppliers,
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
export function mapRound(row: ReadRow): ReceiptRoundItem {
  return {
    id: text(row.id),
    receiptLineId: text(row.receipt_line_id),
    roundNo: Number(row.round_no),
    previousRoundId: nullableText(row.previous_round_id),
    triggerType: row.trigger_type as ReceiptRoundItem['triggerType'],
    receiptRevisionId: text(row.receipt_revision_id),
    startingQuantity: text(row.starting_quantity),
    status: row.status as ReceiptRoundItem['status'],
    inspectionId: nullableText(row.inspection_id),
    reason: text(row.reason),
    version: Number(row.version),
    createdBy: text(row.created_by),
    createdAt: date(row.created_at),
  };
}
export function mapAllocation(row: ReadRow): ReceiptAllocationItem {
  return {
    id: text(row.id),
    receiptLineId: text(row.receipt_line_id),
    roundId: text(row.round_id),
    acceptanceId: nullableText(row.acceptance_id),
    purchaseOrderLineId: nullableText(row.purchase_order_line_id),
    purchaseNo: nullableText(row.purchase_no),
    receiptRevisionId: text(row.receipt_revision_id),
    inspectionId: nullableText(row.inspection_id),
    quantity: text(row.quantity),
    inboundQuantity: text(row.inbound_quantity),
    returnedQuantity: text(row.returned_quantity),
    remainingQuantity: String(
      Number(row.quantity) - Number(row.inbound_quantity) - Number(row.returned_quantity),
    ),
    isCurrent: Number(row.is_current) === 1,
    disposition: row.disposition as ReceiptAllocationItem['disposition'],
    returnReason: row.return_reason as ReceiptAllocationItem['returnReason'],
    terminationReason: nullableText(row.termination_reason),
    remark: nullableText(row.remark),
    createdBy: text(row.created_by),
    createdAt: date(row.created_at),
  };
}
export function mapReturn(row: ReadRow): SupplierReturnItem {
  return {
    id: text(row.id),
    returnNo: text(row.return_no),
    receiptLineId: text(row.receipt_line_id),
    receiptRevisionId: text(row.receipt_revision_id),
    allocationId: text(row.allocation_id),
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
    allocationId: text(row.allocation_id),
    inspectionId: text(row.inspection_id),
    receiptRevisionId: text(row.receipt_revision_id),
    quantity: text(row.quantity),
    confirmedAt: date(row.inbound_at),
  };
}

export async function readReceiptSuppliers(
  db: Db,
  ids: string[],
): Promise<Map<string, ProcurementSupplierSummary[]>> {
  const result = new Map<string, ProcurementSupplierSummary[]>();
  if (!ids.length) return result;
  const [rows] = await db.query<ReadRow[]>(
    `SELECT DISTINCT line.receipt_id,pol.supplier_id,supplier.supplier_name
    FROM procurement_receipt_line line JOIN procurement_order_line pol ON pol.id=line.purchase_order_line_id
    JOIN procurement_supplier supplier ON supplier.id=pol.supplier_id
    WHERE line.receipt_id IN (${slots(ids)}) ORDER BY line.receipt_id,pol.supplier_id`,
    ids,
  );
  for (const row of rows) {
    const id = text(row.receipt_id);
    result.set(id, [
      ...(result.get(id) ?? []),
      { id: text(row.supplier_id), supplierName: text(row.supplier_name) },
    ]);
  }
  return result;
}
