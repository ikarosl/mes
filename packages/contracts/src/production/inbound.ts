import type { PageQuery, ReasonedVersionedCommand } from '../common.js';
import type { InboundOrderStatus } from './statuses.js';

export interface PurchaseInboundDetailItem {
  id: string;
  itemId: string;
  materialVariantId: string;
  materialVariantCode: string;
  itemCode: string;
  itemName: string;
  itemBatchId: string;
  batchCode: string;
  inboundQuantity: string;
  unit: string;
  stockStatus: 'available';
  inventoryTransactionId: string | null;
  procurementReceiptLineId: string | null;
  procurementReceiptRevisionId: string | null;
  procurementInspectionId: string | null;
  procurementAllocationId: string | null;
  supplierId: string | null;
  supplierName: string | null;
  /** Historical source of this actual inbound detail; absent on legacy purchased inbounds. */
  procurementSource: {
    receipt: {
      receiptId: string;
      receiptNo: string;
      receiptLineId: string;
      receiptLineNo: number;
      /** Purchase order on which this delivery was originally registered. */
      purchaseOrderNo: string;
    };
    /** Purchase order assigned by this detail's immutable allocation. */
    purchaseOrder: {
      purchaseOrderId: string;
      purchaseOrderNo: string;
      purchaseOrderLineId: string;
      purchaseOrderLineNo: number;
    };
    inspection: {
      inspectionId: string;
      caseId: string;
      inspectedAt: string;
    };
  } | null;
}

export interface PurchaseInboundOrderItem {
  inboundId: string;
  inboundNo: string;
  sourceType: 'purchased';
  suppliers: Array<{ supplierId: string | null; supplierName: string }>;
  status: InboundOrderStatus;
  inboundAt: string | null;
  operatorId: string | null;
  operatorName: string | null;
  createdById: string | null;
  createdByName: string | null;
  createdAt: string;
  version: number;
  remark: string | null;
  cancelReason?: string | null;
  cancelledById?: string | null;
  cancelledByName?: string | null;
  cancelledAt?: string | null;
  detailCount: number;
  totalInboundQuantity: string;
  quantitySummary: Array<{ unit: string; quantity: string }>;
  details: PurchaseInboundDetailItem[];
}

export type CancelPurchaseInboundPayload = ReasonedVersionedCommand;

export interface PurchaseInboundOrderQuery extends PageQuery {
  keyword?: string;
  status?: InboundOrderStatus;
}

export interface CreatePurchaseInboundPayload {
  provider?: string | null;
  remark?: string | null;
  details: Array<{
    itemId: string;
    materialVariantId: string;
    inboundQuantity: number;
    remark?: string | null;
  }>;
}
