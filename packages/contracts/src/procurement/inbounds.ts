import type { PageQuery } from '../common.js';
import type { InventoryInboundTarget } from '../production/inventory-target.js';
export interface ProcurementInboundSourceQuery extends PageQuery {
  keyword?: string;
  supplierId?: string;
  purchaseOrderId?: string;
  receiptLineId?: string;
  receiptLineIds?: string[];
}
/** Active arrival material. Inspection and planned quantities do not grant or limit warehouse entry. */
export interface ProcurementInboundSourceItem {
  purchaseOrderLineId: string;
  receiptId: string;
  receiptNo: string;
  receiptLineId: string;
  receiptLineVersion: number;
  receiptReceivedAt: string;
  receiptPurchaseNo: string;
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
  plannedQuantity: string;
  supplierBatchCode: string | null;
  inboundQuantity: string;
  handlingCount: number;
  otherHandlingNote: string | null;
}
export interface ConfirmProcurementInboundPayload {
  remark?: string | null;
  details: Array<{
    receiptLineId: string;
    version: number;
    quantity: number;
    target: InventoryInboundTarget;
  }>;
}
export interface ConfirmProcurementInboundResult {
  inboundId: string;
  inboundNo: string;
  details: Array<{
    receiptLineId: string;
    batchId: string;
    inboundDetailId: string;
    transactionId: string;
  }>;
}
