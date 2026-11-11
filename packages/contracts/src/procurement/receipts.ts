import type { PageQuery, ReasonedVersionedCommand } from '../common.js';

export type ReceiptLineStage = 'registered' | 'handled' | 'voided';
export interface ProcurementReceiptVoidItem {
  reason: string;
  createdBy: string;
  createdAt: string;
}
export interface ReceiptQuantitySummary {
  inboundQuantity: string;
}
export interface ProcurementReceiptQuery extends PageQuery {
  keyword?: string;
  supplierId?: string;
  purchaseOrderId?: string;
}
export interface ProcurementReceiptItem {
  id: string;
  receiptNo: string;
  purchaseOrderId: string;
  purchaseNo: string;
  supplierId: string;
  supplierName: string;
  receivedAt: string;
  handoverEvidence: string | null;
  remark: string | null;
  createdAt: string;
  lineCount: number;
  version: number;
  void: ProcurementReceiptVoidItem | null;
}
export interface ProcurementReceiptLineLocation {
  purchaseOrderId: string;
  receiptId: string;
  receiptLineId: string;
}
export interface ProcurementReceiptLineOverview {
  id: string;
  receiptId: string;
  receiptNo: string;
  purchaseOrderId: string;
  purchaseNo: string;
  purchaseOrderLineId: string;
  purchaseOrderLineNo: number;
  supplierId: string;
  supplierName: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  materialVariantId: string;
  materialVariantCode: string;
  unit: string;
  supplierBatchCode: string | null;
  version: number;
  stage: ReceiptLineStage;
  quantities: ReceiptQuantitySummary;
  handlingCount: number;
  otherHandlingNote: string | null;
  void: ProcurementReceiptVoidItem | null;
}
export interface ProcurementReceiptLine extends ProcurementReceiptLineOverview {
  plannedQuantity: string;
}
export type ProcurementReceiptLineIndexItem = ProcurementReceiptLineOverview;
export type ProcurementReceiptLineListItem = ProcurementReceiptLineOverview;
export interface ProcurementReceiptWorklistLines {
  receipt: ProcurementReceiptItem;
  items: ProcurementReceiptLineListItem[];
}
export interface ProcurementReceiptDetail extends ProcurementReceiptItem {
  items: ProcurementReceiptLineIndexItem[];
}
export interface ReceiptVoidLineVersion {
  receiptLineId: string;
  version: number;
}
export interface ProcurementReceiptVoiding {
  canVoid: boolean;
  blockedReason: string | null;
  lines: ReceiptVoidLineVersion[];
}
export interface ProcurementReceiptVoidingDetail extends ProcurementReceiptItem {
  items: ProcurementReceiptLineOverview[];
  voiding: ProcurementReceiptVoiding;
}
export interface VoidProcurementReceiptPayload extends ReasonedVersionedCommand {
  lines: ReceiptVoidLineVersion[];
}
export interface VoidProcurementReceiptCommandResult {
  receiptId: string;
  version: number;
}
export interface ConfirmProcurementReceiptPayload {
  purchaseOrderId: string;
  purchaseOrderVersion: number;
  receivedAt: string;
  handoverEvidence?: string | null;
  remark?: string | null;
  details: Array<{
    purchaseOrderLineId: string;
    version: number;
    supplierBatchCode?: string | null;
  }>;
}
export interface ProcurementReceiptCommandResult {
  receiptId: string;
}
export interface ReceiptInboundHistoryItem {
  inboundId: string;
  inboundNo: string;
  inboundDetailId: string;
  transactionId: string;
  batchId: string;
  batchCode: string;
  quantity: string;
  confirmedAt: string;
}
export interface RecordReceiptHandlingPayload {
  otherHandlingNote: string;
}
/** Immutable text of an offline handling decision, without an execution or return quantity. */
export interface ReceiptHandlingItem {
  id: string;
  receiptLineId: string;
  inboundId: string | null;
  otherHandlingNote: string;
  createdBy: string;
  createdAt: string;
}
export type ReceiptHistoryKind = 'handlings' | 'inbounds';
export type ReceiptHistoryItem = ReceiptHandlingItem | ReceiptInboundHistoryItem;
