import type { ReceiptQuantitySummary } from './receipts.js';
import type {
  PageQuery,
  PageResult,
  VersionedCommand,
  ReasonedVersionedCommand,
} from '../common.js';

export type PurchaseFulfillmentMode = 'new_arrival' | 'existing_receipt';
export type PurchaseOrderSourceType = 'demand' | 'stock';
export type PurchaseOrderStatus = 'draft' | 'ordered' | 'completed' | 'cancelled';
export type PurchaseOrderLineStatus = 'draft' | 'open' | 'closed' | 'cancelled';
export type PurchaseOrderSupplementReason = 'excess_purchase' | 'quality_replacement';
export interface PurchaseOrderQuery extends PageQuery {
  keyword?: string;
  supplierId?: string;
  sourceType?: PurchaseOrderSourceType;
  status?: PurchaseOrderStatus;
  supplementReason?: PurchaseOrderSupplementReason;
  originOrderLineId?: string;
  originReceiptLineId?: string;
}
export interface PurchaseOrderLineReceiptRecordQuery extends PageQuery {
  keyword?: string;
}
export interface PurchaseOrderLineReceiptRecord {
  receiptId: string;
  receiptLineId: string;
  receiptNo: string;
  receivedAt: string;
  supplierBatchCode: string | null;
  /** 当前累计到货中计入本采购行的数量。 */
  receivedQuantity: string;
}
export interface PurchaseOrderLineReceiptRecordPage extends PageResult<PurchaseOrderLineReceiptRecord> {
  /** 本采购行完整累计量，不受 keyword 或分页影响。 */
  receivedQuantity: string;
}
export interface PurchaseExcessReceiptCandidateQuery extends PageQuery {
  keyword?: string;
  receiptLineId?: string;
}
/** 整次到货的处理数量；待退、已退包含全部原因，不表示补单资格或额度。 */
export type PurchaseSupplementReceiptQuantities = Pick<
  ReceiptQuantitySummary,
  | 'receivedQuantity'
  | 'pendingInboundQuantity'
  | 'inboundQuantity'
  | 'pendingReturnQuantity'
  | 'returnedQuantity'
>;
export interface PurchaseExcessReceiptCandidate extends PurchaseSupplementReceiptQuantities {
  id: string;
  receiptId: string;
  receiptNo: string;
  receivedAt: string;
  supplierBatchCode: string | null;
  receiptLinkedSupplements: Array<{
    status: PurchaseOrderStatus;
    count: number;
    plannedQuantity: string;
  }>;
}
export interface PurchaseQualityReplacementCandidateQuery extends PageQuery {
  keyword?: string;
  receiptLineId?: string;
}
/** 到货登记来源由请求路径中的原采购行确定。 */
export interface PurchaseQualityReplacementCandidate extends PurchaseSupplementReceiptQuantities {
  receiptLineId: string;
  receiptId: string;
  receiptNo: string;
  receivedAt: string;
  supplierBatchCode: string | null;
  receiptLinkedSupplements: Array<{
    status: PurchaseOrderStatus;
    count: number;
    plannedQuantity: string;
  }>;
}
export interface PurchaseOrderItem {
  id: string;
  purchaseNo: string;
  supplierId: string;
  supplierName: string;
  workOrderId: string | null;
  workOrderNo: string | null;
  sourceType: PurchaseOrderSourceType;
  supplementReason: PurchaseOrderSupplementReason | null;
  status: PurchaseOrderStatus;
  remark: string | null;
  version: number;
  lineCount: number;
  orderedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export type ProcurementReceiptOrderOption = PurchaseOrderItem;
export interface PurchaseOrderLineSource {
  demandId: string;
  workOrderId: string;
  workOrderNo: string;
  productionBatchId: string;
  batchNo: string;
  demandQuantity: string;
  remainingDemandQuantity: string;
  supplierHint: string | null;
}
export interface PurchaseOrderLine {
  fulfillmentMode: PurchaseFulfillmentMode;
  taxExclusiveAmount: string | null;
  taxInclusiveAmount: string | null;
  id: string;
  lineNo: number;
  itemId: string;
  itemCode: string;
  itemName: string;
  materialVariantId: string;
  materialVariantCode: string;
  unit: string;
  plannedQuantity: string;
  status: PurchaseOrderLineStatus;
  version: number;
  sources: PurchaseOrderLineSource[];
  originOrderLineId: string | null;
  originPurchaseOrderId: string | null;
  originPurchaseNo: string | null;
  supplementEvidence: string | null;
  originReceiptLineId: string | null;
  originReceiptNo: string | null;
  quantities: ReceiptQuantitySummary | null;
}
export interface PurchaseOrderDetail extends PurchaseOrderItem {
  canCancel: boolean;
  items: PurchaseOrderLine[];
}
export interface PurchaseOrderDraftLine {
  taxExclusiveAmount?: string | null;
  taxInclusiveAmount?: string | null;
  itemId: string;
  materialVariantId: string;
  plannedQuantity: number;
  demandIds: string[];
}
export interface CreatePurchaseOrderPayload {
  supplierId: string;
  workOrderId: string | null;
  sourceType: PurchaseOrderSourceType;
  remark?: string | null;
  items: PurchaseOrderDraftLine[];
}
export interface UpdatePurchaseOrderPayload extends CreatePurchaseOrderPayload, VersionedCommand {}
export type PlacePurchaseOrderPayload = VersionedCommand;
export type CancelPurchaseOrderPayload = ReasonedVersionedCommand;
export type ClosePurchaseOrderPayload = ReasonedVersionedCommand;
export type ClosePurchaseOrderLinePayload = ReasonedVersionedCommand;
export type ReopenPurchaseOrderLinePayload = ReasonedVersionedCommand;
/** 同一原采购单、同一补因；各行独立保留原采购行、真实到货及补购说明。 */
export interface CreatePurchaseOrderSupplementLinePayload {
  taxExclusiveAmount?: string | null;
  taxInclusiveAmount?: string | null;
  originOrderLineId: string;
  originReceiptLineId: string;
  plannedQuantity: number;
  supplementEvidence: string;
}
export interface CreatePurchaseOrderSupplementPayload {
  supplementReason: PurchaseOrderSupplementReason;
  items: CreatePurchaseOrderSupplementLinePayload[];
  remark?: string | null;
}
export interface PurchaseOrderCommandResult {
  purchaseOrderId: string;
  version: number;
}
export interface RelatedPurchasesQuery extends PageQuery {
  demandIds: string[];
}
export interface RelatedPurchaseLine {
  purchaseOrderId: string;
  purchaseNo: string;
  purchaseOrderStatus: PurchaseOrderStatus;
  purchaseOrderLineId: string;
  lineStatus: PurchaseOrderLineStatus;
  supplierId: string;
  supplierName: string;
  supplementReason: PurchaseOrderSupplementReason | null;
  plannedQuantity: string;
  demandIds: string[];
}
export interface RelatedPurchasesResult extends PageResult<RelatedPurchaseLine> {
  summaries: Array<{ demandId: string; purchaseOrderCount: number }>;
}
