import type { ProcurementReceiptListSource } from '@company/contracts';

export interface ReceiptWorklistReceipt<T extends ProcurementReceiptListSource> {
  receiptNo: string;
  supplierName: string;
  lines: T[];
}
