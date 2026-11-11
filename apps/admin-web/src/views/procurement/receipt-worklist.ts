import type { ProcurementReceiptVoidItem } from '@company/contracts';
export interface ReceiptWorklistLine {
  itemName: string;
  materialVariantCode: string;
  void: ProcurementReceiptVoidItem | null;
}
export interface ReceiptWorklistReceipt<T extends ReceiptWorklistLine> {
  receiptNo: string;
  supplierName: string;
  lines: T[];
}
