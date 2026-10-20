import type { PurchaseOrderSupplementReason } from '@company/contracts';

export interface RelatedSupplementFilter {
  originReceiptLineId?: string;
  supplementReason?: PurchaseOrderSupplementReason;
}

export interface RelatedSupplementLocation extends RelatedSupplementFilter {
  purchaseOrderId: string;
  originOrderLineId: string;
}
