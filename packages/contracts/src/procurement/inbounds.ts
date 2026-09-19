import type { PageQuery } from '../common.js';

export interface ProcurementInboundReleaseQuery extends PageQuery {
  keyword?: string;
  supplierId?: string;
  purchaseOrderId?: string;
  receiptLineId?: string;
  scopeIds?: string[];
}
export interface ProcurementInboundReleaseItem {
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
  scopeId: string;
  scopeVersion: number;
  receiptRevisionId: string;
  inspectionId: string;
  approvedRemainingQuantity: string;
}
export interface ConfirmProcurementInboundPayload {
  remark?: string | null;
  details: Array<{
    receiptLineId: string;
    version: number;
    scopeId: string;
    scopeVersion: number;
    receiptRevisionId: string;
    inspectionId: string;
    quantity: number;
  }>;
}
export interface ConfirmProcurementInboundResult {
  inboundId: string;
  inboundNo: string;
  details: Array<{
    receiptLineId: string;
    scopeId: string;
    batchId: string;
    inboundDetailId: string;
    transactionId: string;
  }>;
}
