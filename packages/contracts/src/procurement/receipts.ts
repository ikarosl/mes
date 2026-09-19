import type { PageQuery } from '../common.js';
import type {
  QualityInboundCaseItem,
  QualityInboundCaseType,
  QualityInboundInspectionInput,
  QualityInboundCaseQuery,
} from '../quality/inbound-inspections.js';

export type ReceiptScopeDisposition =
  | 'uninspected'
  | 'reviewing'
  | 'approved'
  | 'quality_return'
  | 'termination_return'
  | 'inbounded'
  | 'returned'
  | 'superseded';
export type ReceiptScopeTransition =
  | 'receipt'
  | 'split'
  | 'inspection'
  | 'review'
  | 'receipt_correction'
  | 'termination'
  | 'inbound'
  | 'return';
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
  handoverEvidence: string;
  remark: string | null;
  createdAt: string;
  lineCount: number;
}
export interface ReceiptQuantitySummary {
  receivedQuantity: string;
  undeterminedQuantity: string;
  approvedQuantity: string;
  inboundQuantity: string;
  returnDueQuantity: string;
  returnedQuantity: string;
  qualityReturnedQuantity: string;
  pendingInboundQuantity: string;
  pendingReturnQuantity: string;
  hasOpenReview: boolean;
}
export interface ReceiptRevisionItem {
  id: string;
  receiptLineId: string;
  revisionNo: number;
  previousRevisionId: string | null;
  receivedQuantity: string;
  reason: string;
  physicalIdentityConfirmed: boolean;
  createdBy: string;
  createdAt: string;
}
export interface ReceiptScopeItem {
  id: string;
  receiptLineId: string;
  receiptRevisionId: string;
  parentScopeId: string | null;
  quantity: string;
  disposition: ReceiptScopeDisposition;
  transitionType: ReceiptScopeTransition;
  inspectionId: string | null;
  reviewCaseId: string | null;
  terminationRootScopeId: string | null;
  terminationReason: string | null;
  version: number;
  createdAt: string;
}
export interface SupplierReturnItem {
  id: string;
  returnNo: string;
  receiptLineId: string;
  receiptRevisionId: string;
  scopeId: string;
  inspectionId: string | null;
  reasonType: 'quality' | 'procurement_termination';
  returnedQuantity: string;
  returnedAt: string;
  handoverEvidence: string;
  remark: string | null;
  createdBy: string;
  createdAt: string;
}
export interface ReceiptInboundHistoryItem {
  inboundId: string;
  inboundNo: string;
  inboundDetailId: string;
  transactionId: string;
  scopeId: string;
  inspectionId: string;
  receiptRevisionId: string;
  quantity: string;
  confirmedAt: string;
}
export interface ProcurementReceiptLine {
  id: string;
  receiptId: string;
  purchaseOrderId: string;
  purchaseOrderLineId: string;
  lineNo: number;
  itemId: string;
  itemCode: string;
  itemName: string;
  materialVariantId: string;
  materialVariantCode: string;
  unit: string;
  supplierBatchCode: string | null;
  currentReceiptRevisionId: string;
  batchId: string | null;
  batchCode: string | null;
  overReceiptNote: string | null;
  version: number;
  quantities: ReceiptQuantitySummary;
  revisions: ReceiptRevisionItem[];
  scopes: ReceiptScopeItem[];
  cases: QualityInboundCaseItem[];
  returns: SupplierReturnItem[];
  inbounds: ReceiptInboundHistoryItem[];
  historyTotals: Record<ReceiptHistoryKind, number>;
}
export interface ProcurementReceiptDetail extends ProcurementReceiptItem {
  items: ProcurementReceiptLine[];
}
export interface ConfirmProcurementReceiptPayload {
  purchaseOrderId: string;
  purchaseOrderVersion: number;
  receivedAt: string;
  handoverEvidence: string;
  remark?: string | null;
  details: Array<{
    purchaseOrderLineId: string;
    version: number;
    receivedQuantity: number;
    supplierBatchCode?: string | null;
    overReceiptNote?: string | null;
  }>;
}
export interface CorrectReceiptLinePayload {
  version: number;
  previousRevisionId: string;
  receivedQuantity: number;
  reason: string;
  physicalIdentityConfirmed: true;
  adjustments: Array<{ scopeId: string; scopeVersion: number; revisedQuantity: number }>;
  newRemainderQuantity: number;
}
export interface StartReceiptReviewPayload {
  version: number;
  scopeId: string;
  scopeVersion: number;
  quantity: number;
  caseType: Exclude<QualityInboundCaseType, 'receipt_correction'>;
  reason: string;
}
export interface InspectReceiptLinePayload extends QualityInboundInspectionInput {
  version: number;
  caseId: string;
  caseVersion: number;
  receiptRevisionId: string;
}
export interface TerminateReceiptScopePayload {
  version: number;
  scopeId: string;
  scopeVersion: number;
  quantity: number;
  reason: string;
}
export interface ConfirmSupplierReturnPayload {
  version: number;
  scopeId: string;
  scopeVersion: number;
  receiptRevisionId: string;
  returnedAt: string;
  handoverEvidence: string;
  remark?: string | null;
}
/** 命令后按 receiptId 重新查询最新详情；修订可同时创建多个复核办理。 */
export interface ProcurementReceiptCommandResult {
  receiptId: string;
  receiptLineId: string | null;
  caseIds: string[];
  inspectionId: string | null;
  supplierReturnId: string | null;
}
export interface ProcurementInboundInspectionQuery extends Omit<QualityInboundCaseQuery, 'status'> {
  keyword?: string;
  supplierId?: string;
  status?: 'uninspected' | 'reviewing' | 'completed' | 'superseded';
}
export interface ProcurementInboundInspectionItem {
  taskKey: string;
  taskKind: 'uninspected' | 'case';
  case: QualityInboundCaseItem | null;
  receiptLineId: string;
  receiptLineVersion: number;
  scopeId: string | null;
  scopeVersion: number | null;
  coveredQuantity: string;
  receiptId: string;
  receiptNo: string;
  purchaseOrderId: string;
  purchaseNo: string;
  supplierName: string;
  itemCode: string;
  itemName: string;
  materialVariantCode: string;
  unit: string;
}
export type ReceiptHistoryKind = 'revisions' | 'scopes' | 'cases' | 'returns' | 'inbounds';
export type ReceiptHistoryItem =
  | ReceiptRevisionItem
  | ReceiptScopeItem
  | QualityInboundCaseItem
  | SupplierReturnItem
  | ReceiptInboundHistoryItem;
