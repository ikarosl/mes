import type {
  PurchaseQualityReplacementCandidateQuery,
  PurchaseQualityReplacementCandidate,
  PageResult,
} from '@company/contracts';
import type { Db } from '../mysql-purchase-order.shared.js';
import { listSupplementReceiptCandidates } from './purchase-supplement-candidates.query.js';
export async function listQualityReplacementCandidates(
  db: Db,
  purchaseOrderLineId: string,
  query: PurchaseQualityReplacementCandidateQuery & { page: number; pageSize: number },
): Promise<PageResult<PurchaseQualityReplacementCandidate>> {
  const result = await listSupplementReceiptCandidates(
    db,
    purchaseOrderLineId,
    query,
    'quality_replacement',
  );
  return {
    ...result,
    items: result.items.map(({ id, ...item }) => ({ ...item, receiptLineId: id })),
  };
}
