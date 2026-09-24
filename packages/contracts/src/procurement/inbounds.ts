import type { PageQuery } from '../common.js';

export interface ProcurementInboundReleaseQuery extends PageQuery {
  keyword?: string;
  supplierId?: string;
  purchaseOrderId?: string;
  receiptLineId?: string;
  allocationIds?: string[];
}
export interface ProcurementInboundReleaseItem {
  roundId: string;
  roundVersion: number;
  acceptanceId: string;
  allocationId: string;
  purchaseOrderLineId: string;
  receiptId: string;
  receiptNo: string;
  receiptLineId: string;
  receiptLineVersion: number;
  purchaseOrderId: string;
  purchaseNo: string;
  supplierId: string;
  supplierName: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  materialVariantId: string;
  materialVariantCode: string;
  unit: string;
  supplierBatchCode: string | null;
  batchId: string | null;
  batchCode: string | null;
  receiptRevisionId: string;
  inspectionId: string;
  approvedRemainingQuantity: string;
}
export interface ConfirmProcurementInboundPayload {
  remark?: string | null;
  details: Array<{
    receiptLineId: string;
    roundId: string;
    roundVersion: number;
    version: number;
    receiptRevisionId: string;
    allocationId: string;
    inspectionId: string;
    quantity: number;
  }>;
}
export interface ConfirmProcurementInboundResult {
  inboundId: string;
  inboundNo: string;
  details: Array<{
    receiptLineId: string;
    allocationId: string;
    batchId: string;
    inboundDetailId: string;
    transactionId: string;
  }>;
}
