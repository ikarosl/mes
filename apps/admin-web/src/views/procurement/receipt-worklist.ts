import type { ProcurementReceiptListSource } from '@company/contracts';

export interface ReceiptWorklistReceipt<T extends ProcurementReceiptListSource> {
  receiptId: string;
  receiptNo: string;
  lines: T[];
}
interface ReceiptWorklistPurchase<T extends ProcurementReceiptListSource> {
  purchaseOrderId: string;
  purchaseNo: string;
  lines: T[];
  receipts: ReceiptWorklistReceipt<T>[];
}
export interface ReceiptWorklistHandle {
  expandPage(): void;
}

/** 仅组织当前分页窗口，不计算整单统计或改变明细顺序。 */
export function groupReceiptWorklist<T extends ProcurementReceiptListSource>(
  rows: readonly T[],
): ReceiptWorklistPurchase<T>[] {
  const purchases = new Map<string, ReceiptWorklistPurchase<T>>();
  const receipts = new Map<string, ReceiptWorklistReceipt<T>>();
  for (const row of rows) {
    let purchase = purchases.get(row.purchaseOrderId);
    if (!purchase) {
      purchase = {
        purchaseOrderId: row.purchaseOrderId,
        purchaseNo: row.purchaseNo,
        lines: [],
        receipts: [],
      };
      purchases.set(row.purchaseOrderId, purchase);
    }
    purchase.lines.push(row);
    let receipt = receipts.get(row.receiptId);
    if (!receipt) {
      receipt = { receiptId: row.receiptId, receiptNo: row.receiptNo, lines: [] };
      receipts.set(row.receiptId, receipt);
      purchase.receipts.push(receipt);
    }
    receipt.lines.push(row);
  }
  return [...purchases.values()];
}
