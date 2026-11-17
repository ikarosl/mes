import type { PageQuery } from './common.js';

export type StockDocumentDirection = 'inbound' | 'outbound';
export type StockDocumentItemKind = 'material' | 'finished_product';
export type StockDocumentSourceType =
  'purchased' | 'finished_product' | 'return_inbound' | 'production_material' | 'other';
export type StockDocumentStatus = 'pending' | 'pending_picking' | 'completed' | 'cancelled';

export interface StockDocumentQuery extends PageQuery {
  direction: StockDocumentDirection;
  itemKind: StockDocumentItemKind;
  sourceType?: StockDocumentSourceType;
  status?: StockDocumentStatus;
  keyword?: string;
}

export interface StockDocumentReference {
  id: string;
  orderNo: string;
}

export interface StockDocumentProcurementSource {
  receipt: {
    receiptId: string;
    receiptNo: string;
    receiptLineId: string;
    receiptLineNo: number;
  };
  purchaseOrder: {
    purchaseOrderId: string;
    purchaseOrderNo: string;
    purchaseOrderLineId: string;
    purchaseOrderLineNo: number;
  };
  supplierId: string | null;
  supplierName: string | null;
}

export interface StockDocumentProductionSource {
  workOrderId: string;
  workOrderNo: string;
  productionBatchId: string;
  batchNo: string;
  productionOutputId: string | null;
  trackingCardId: string | null;
  trackingCardNo: string | null;
  allocationId: string | null;
  demandId: string | null;
}

export interface StockDocumentLine {
  id: string;
  lineNo: number;
  itemKind: StockDocumentItemKind;
  itemId: string | null;
  materialVariantId: string | null;
  productId: string | null;
  itemCode: string;
  itemName: string;
  materialVariantCode: string | null;
  unit: string;
  quantity: string;
  targetMode: 'new' | 'existing';
  newBatchKey: string | null;
  batchId: string | null;
  batchCode: string | null;
  stockStatus: 'available';
  remark: string | null;
  isDeleted: boolean;
  inventoryTransactionId: string | null;
  procurementSource: StockDocumentProcurementSource | null;
  productionSource: StockDocumentProductionSource | null;
}

export interface StockDocumentSources {
  procurementReceipts: StockDocumentReference[];
  purchaseOrders: StockDocumentReference[];
  productionBatches: StockDocumentReference[];
  workOrders: StockDocumentReference[];
  suppliers: Array<{ id: string | null; name: string }>;
}

/** A real public stock-document parent; details never combine orders sharing a batch. */
export interface StockDocumentOrder {
  id: string;
  orderNo: string;
  direction: StockDocumentDirection;
  itemKind: StockDocumentItemKind;
  sourceType: StockDocumentSourceType;
  status: StockDocumentStatus;
  version: number;
  reason: string | null;
  remark: string | null;
  detailCount: number;
  quantitySummary: Array<{ unit: string; quantity: string }>;
  /** Ordered by lineNo; exact detail includes deleted draft lines for history. */
  details: StockDocumentLine[];
  sources: StockDocumentSources;
  createdById: string;
  createdByName: string | null;
  createdAt: string;
  operatorId: string | null;
  operatorName: string | null;
  confirmedAt: string | null;
  cancelSource: 'manual' | 'production_batch' | 'production_termination' | null;
  cancelReason: string | null;
  cancelledById: string | null;
  cancelledByName: string | null;
  cancelledAt: string | null;
}
