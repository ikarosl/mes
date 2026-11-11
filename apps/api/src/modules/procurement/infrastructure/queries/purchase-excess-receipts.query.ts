import type { PurchaseExcessReceiptCandidateQuery } from '@company/contracts';
import type { Db } from '../mysql-purchase-order.shared.js';
import { listSupplementReceiptCandidates } from './purchase-supplement-candidates.query.js';
export function listExcessReceiptCandidates(
  db: Db,
  purchaseOrderLineId: string,
  query: PurchaseExcessReceiptCandidateQuery & { page: number; pageSize: number },
) {
  return listSupplementReceiptCandidates(db, purchaseOrderLineId, query, 'excess_purchase');
}
