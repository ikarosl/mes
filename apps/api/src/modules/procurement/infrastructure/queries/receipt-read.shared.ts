import type { Db } from '../mysql-purchase-order.shared.js';
import type { RowDataPacket } from 'mysql2/promise';
import type {
  ProcurementReceiptDetail,
  ProcurementReceiptItem,
  ProcurementReceiptVoidItem,
  ProcurementReceiptListSource,
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
  `SELECT ${columns} FROM procurement_receipt r JOIN procurement_order po ON po.id=r.purchase_order_id JOIN procurement_supplier supplier ON supplier.id=po.supplier_id`;
export const RECEIPT_VOID_COLUMNS = `r.is_voided,r.void_reason,
  r.voided_by void_created_by,r.voided_at void_created_at`;
export const RECEIPT_HEADER_COLUMNS = `r.id,r.receipt_no,po.purchase_no,po.supplier_id,supplier.supplier_name,r.received_at,r.handover_evidence,r.remark,
  ${RECEIPT_VOID_COLUMNS}`;
export const RECEIPT_COLUMNS = `${RECEIPT_HEADER_COLUMNS},r.purchase_order_id,r.created_at,r.version,
  (SELECT COUNT(*) FROM procurement_receipt_line pending_line JOIN procurement_receipt_round pending_round ON pending_round.id=pending_line.current_round_id WHERE pending_line.receipt_id=r.id AND pending_round.status='awaiting_acceptance') awaiting_acceptance_count,
  (SELECT COUNT(*) FROM procurement_receipt_line line WHERE line.receipt_id=r.id) line_count`;
/** 只共享本模块来源骨架；跨模块展示关联在完整 SELECT 中声明，便于核验字段与用途。 */
const RECEIPT_LINE_SOURCE_FROM = `FROM procurement_receipt_line line
  JOIN procurement_order_line pol ON pol.id=line.purchase_order_line_id
  JOIN procurement_order po ON po.id=line.purchase_order_id
  JOIN procurement_supplier supplier ON supplier.id=po.supplier_id`;
export const RECEIPT_LINE_FROM = `${RECEIPT_LINE_SOURCE_FROM}
  JOIN procurement_receipt r ON r.id=line.receipt_id`;
export const receiptLineSourceSelect = (
  columns: string,
): string => `SELECT ${columns} ${RECEIPT_LINE_SOURCE_FROM}
  JOIN materials material ON material.id=line.item_id`;
export const lineSelect = (columns: string): string => `SELECT ${columns} ${RECEIPT_LINE_FROM}
  JOIN materials material ON material.id=line.item_id`;
export const LINE_COLUMNS = `line.id,line.receipt_id,line.purchase_order_id,line.purchase_order_line_id,pol.line_no purchase_order_line_no,
  line.item_id,pol.item_code_snapshot,material.material_name,line.material_variant_id,pol.material_variant_code_snapshot,
  pol.unit_snapshot,line.supplier_batch_code,line.current_receipt_revision_id,
  line.over_receipt_note,line.version,line.current_round_id,r.receipt_no,po.purchase_no,po.supplier_id,supplier.supplier_name,
  ${RECEIPT_VOID_COLUMNS}`;
/** 采购到货与来料检验的完整轻量明细共用展示来源。 */
export const RECEIPT_LIST_SOURCE_COLUMNS = `line.receipt_id,line.purchase_order_id,
  material.material_name,pol.material_variant_code_snapshot,pol.unit_snapshot,
  ${RECEIPT_VOID_COLUMNS}`;
export function mapReceiptListSource(row: ReadRow): ProcurementReceiptListSource {
  return {
    void: mapReceiptVoid(row),
    receiptId: text(row.receipt_id),
    purchaseOrderId: text(row.purchase_order_id),
    itemName: text(row.material_name),
    materialVariantCode: text(row.material_variant_code_snapshot),
    unit: text(row.unit_snapshot),
  };
}
const CURRENT_ROUND_COLUMNS = `round.id,round.receipt_line_id,round.round_no,round.previous_round_id,
  round.trigger_type,round.receipt_revision_id,round.starting_quantity,round.status,
  round.inspection_id,round.reason,round.version,round.created_by,round.created_at`;
export async function readCurrentRounds(db: Db, ids: string[]): Promise<Map<string, ReadRow>> {
  if (!ids.length) return new Map();
  const [rows] = await db.query<ReadRow[]>(
    `SELECT ${CURRENT_ROUND_COLUMNS} FROM procurement_receipt_round round
    JOIN procurement_receipt_line line ON line.current_round_id=round.id
    WHERE line.id IN (${slots(ids)})`,
    ids,
  );
  return new Map(rows.map((row) => [text(row.receipt_line_id), row]));
}
export const inboundFactSelect = (
  columns: string,
) => `SELECT ${columns} FROM inbound_detail detail JOIN inbound_order inbound ON inbound.id=detail.inbound_id
  JOIN inventory_transaction tx ON tx.reference_type='inbound_detail' AND tx.reference_detail_id=detail.id
    AND tx.transaction_type='purchase_inbound' AND tx.quantity=detail.inbound_number AND tx.quantity>0
    AND tx.batch_id=detail.batch_id AND tx.item_id=detail.item_id AND tx.material_variant_id=detail.material_variant_id
    AND tx.unit_snapshot=detail.unit_snapshot AND tx.stock_status=detail.stock_status
  JOIN item_batch batch ON batch.id=detail.batch_id
  WHERE inbound.source_type='purchased' AND inbound.status='completed' AND detail.stock_status='available'`;
export const INBOUND_FACT_COLUMNS = `inbound.id inbound_id,inbound.inbound_no,detail.id inbound_detail_id,tx.id transaction_id,
  detail.procurement_receipt_line_id receipt_line_id,
  detail.procurement_allocation_id allocation_id,detail.procurement_inspection_id inspection_id,detail.procurement_receipt_revision_id receipt_revision_id,
  tx.quantity,detail.batch_id,batch.batch_code,inbound.inbound_at`;
export function mapReceiptHeader(row: ReadRow): Omit<ProcurementReceiptDetail, 'items'> {
  return {
    void: mapReceiptVoid(row),
    id: text(row.id),
    receiptNo: text(row.receipt_no),
    purchaseNo: text(row.purchase_no),
    supplierId: text(row.supplier_id),
    supplierName: text(row.supplier_name),
    receivedAt: date(row.received_at),
    handoverEvidence: text(row.handover_evidence),
    remark: nullableText(row.remark),
  };
}
export function mapReceipt(row: ReadRow): ProcurementReceiptItem {
  return {
    ...mapReceiptHeader(row),
    version: Number(row.version),
    awaitingAcceptanceCount: Number(row.awaiting_acceptance_count ?? 0),
    purchaseOrderId: text(row.purchase_order_id),
    createdAt: date(row.created_at),
    lineCount: Number(row.line_count),
  };
}
export function mapReceiptVoid(row: ReadRow): ProcurementReceiptVoidItem | null {
  return Number(row.is_voided) !== 1
    ? null
    : {
        reason: text(row.void_reason),
        createdBy: text(row.void_created_by),
        createdAt: date(row.void_created_at),
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
    batchId: text(row.batch_id),
    batchCode: text(row.batch_code),
    allocationId: text(row.allocation_id),
    inspectionId: text(row.inspection_id),
    receiptRevisionId: text(row.receipt_revision_id),
    quantity: text(row.quantity),
    confirmedAt: date(row.inbound_at),
  };
}
