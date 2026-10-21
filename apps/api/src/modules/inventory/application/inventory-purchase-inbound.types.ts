import type { InventoryInboundTarget } from '@company/contracts';

export interface PurchaseReceiptInboundLine {
  allocationId: string;
  receiptLineId: string;
  receiptRevisionId: string;
  inspectionId: string;
  itemId: string;
  materialVariantId: string;
  itemCode: string;
  materialVariantCode: string;
  unit: string;
  supplierNameSnapshot: string;
  quantity: string;
  target: InventoryInboundTarget;
}

/** 来源模块须已锁到货及消费范围，并通过 Quality 校验有效放行依据。 */
export interface ConfirmPurchaseReceiptInput {
  remark?: string | null;
  details: PurchaseReceiptInboundLine[];
}

export interface ConfirmPurchaseReceiptResult {
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

export interface ReceiptInboundFact {
  allocationId: string;
  quantity: string;
}

export interface ReceiptInboundFacts {
  receiptLineId: string;
  inboundQuantity: string;
  receipts: ReceiptInboundFact[];
}
