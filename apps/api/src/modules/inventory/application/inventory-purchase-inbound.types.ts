import type { InventoryInboundTarget } from '@company/contracts';
export interface PurchaseReceiptInboundLine {
  receiptLineId: string;
  itemId: string;
  materialVariantId: string;
  itemCode: string;
  materialVariantCode: string;
  unit: string;
  supplierNameSnapshot: string;
  quantity: string;
  target: InventoryInboundTarget;
}
/** Procurement locks and validates the active arrival source. Inventory alone posts actual quantities. */
export interface ConfirmPurchaseReceiptInput {
  remark?: string | null;
  details: PurchaseReceiptInboundLine[];
}
export interface ConfirmPurchaseReceiptResult {
  inboundId: string;
  inboundNo: string;
  details: Array<{
    receiptLineId: string;
    batchId: string;
    inboundDetailId: string;
    transactionId: string;
  }>;
}
export interface ReceiptInboundFact {
  inboundDetailId: string;
  quantity: string;
}
export interface ReceiptInboundFacts {
  receiptLineId: string;
  inboundQuantity: string;
  receipts: ReceiptInboundFact[];
}
