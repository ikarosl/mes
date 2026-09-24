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
export type PurchaseOrderClosureReason =
  'quality_target' | 'quality_return_completed' | 'manual_end' | 'cancelled';
export interface PurchaseOrderQuery extends PageQuery {
  keyword?: string;
  supplierId?: string;
  sourceType?: PurchaseOrderSourceType;
  status?: PurchaseOrderStatus;
  originOrderLineId?: string;
}
export interface PurchaseExcessReceiptCandidateQuery extends PageQuery {
  receiptLineId?: string;
}
export interface PurchaseExcessReceiptCandidate {
  id: string;
  receiptId: string;
  receiptNo: string;
  lineNo: number;
  receivedAt: string;
  supplierBatchCode: string | null;
  receivedQuantity: string;
  unprocessedQuantity: string;
}
export interface ProcurementSupplierSummary {
  id: string;
  supplierName: string;
}
export interface PurchaseOrderItem {
  id: string;
  purchaseNo: string;
  suppliers: ProcurementSupplierSummary[];
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
export interface PurchaseOrderLineClosure {
  id: string;
  reasonType: PurchaseOrderClosureReason;
  reason: string | null;
  plannedQuantity: string;
  receivedQuantity: string;
  undeterminedQuantity: string;
  approvedQuantity: string;
  inboundQuantity: string;
  returnDueQuantity: string;
  returnedQuantity: string;
  qualityReturnedQuantity: string;
  createdAt: string;
}
export interface PurchaseOrderLine {
  fulfillmentMode: PurchaseFulfillmentMode;
  supplierId: string;
  supplierName: string;
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
  originAllocationId: string | null;
  quantities: ReceiptQuantitySummary;
  allowedCloseReasons: PurchaseOrderClosureReason[];
  closure: PurchaseOrderLineClosure | null;
}
export interface PurchaseOrderDetail extends PurchaseOrderItem {
  items: PurchaseOrderLine[];
}
export interface PurchaseOrderDraftLine {
  supplierId: string;
  itemId: string;
  materialVariantId: string;
  plannedQuantity: number;
  demandIds: string[];
}
export interface CreatePurchaseOrderPayload {
  workOrderId: string | null;
  sourceType: PurchaseOrderSourceType;
  remark?: string | null;
  items: PurchaseOrderDraftLine[];
}
export interface UpdatePurchaseOrderPayload extends CreatePurchaseOrderPayload, VersionedCommand {}
export type PlacePurchaseOrderPayload = VersionedCommand;
export type CancelPurchaseOrderPayload = ReasonedVersionedCommand;
export interface ClosePurchaseOrderLinePayload extends ReasonedVersionedCommand {
  reasonType: PurchaseOrderClosureReason;
}
/** 质量补发引用已确认的质量退回分配，补发依据记录供应商约定。 */
export interface CreatePurchaseOrderSupplementPayload {
  supplementReason: PurchaseOrderSupplementReason;
  originReceiptLineId?: string;
  originAllocationId?: string;
  plannedQuantity: number;
  supplementEvidence: string;
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
