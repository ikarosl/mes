import type { PoolConnection } from 'mysql2/promise';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import {
  insertAllocation,
  type AllocationRow,
  type ReceiptLineRow,
} from './mysql-receipt.shared.js';
import { planReceiptRejectionAllocations } from '../domain/receipt-rejection-allocation.policy.js';
import type { RoundRow } from './mysql-receipt-round.shared.js';

export async function createRejectionAllocations(
  db: PoolConnection,
  line: ReceiptLineRow,
  round: RoundRow,
  sources: AllocationRow[],
  quantity: number,
  reason: string,
  context: CommandContext,
) {
  const plan = planReceiptRejectionAllocations(
    sources.map((source) => ({
      remainingQuantity: source.remaining_quantity,
      terminationReason: source.termination_reason,
    })),
    quantity,
  );
  for (const [index, allocation] of plan.entries())
    await insertAllocation(
      db,
      {
        receiptLineId: String(line.id),
        roundId: String(round.id),
        acceptanceId: null,
        lineNo: index + 1,
        ...allocation,
        disposition: 'return',
        returnReason: 'manual_rejection',
        remark: reason,
      },
      context,
    );
}
