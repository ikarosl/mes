import type { PoolConnection } from 'mysql2/promise';
import type { ReceiptOwnershipInput } from '@company/contracts';
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
  ownership?: ReceiptOwnershipInput[],
) {
  const plan = planReceiptRejectionAllocations(
    String(line.purchase_order_line_id),
    sources.map((source) => ({
      purchaseOrderLineId:
        source.purchase_order_line_id === null ? null : String(source.purchase_order_line_id),
      remainingQuantity: source.remaining_quantity,
      terminationReason: source.termination_reason,
    })),
    quantity,
    ownership,
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
