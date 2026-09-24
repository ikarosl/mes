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
  quantity: string;
  batchId: string | null;
}

/** 来源模块须已锁到货及消费范围，并通过 Quality 校验有效放行依据。 */
export interface ConfirmPurchaseReceiptInput {
  provider: string;
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
  inboundId: string;
  inboundNo: string;
  inboundDetailId: string;
  transactionId: string;
  inspectionId: string;
  receiptRevisionId: string;
  quantity: string;
  confirmedAt: string;
}

export interface ReceiptInboundFacts {
  receiptLineId: string;
  batchId: string | null;
  batchCode: string | null;
  inboundQuantity: string;
  receipts: ReceiptInboundFact[];
}
