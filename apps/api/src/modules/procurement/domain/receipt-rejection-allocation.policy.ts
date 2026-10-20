import { requireQuantity } from './receipt-quantity.policy.js';
import type { ReceiptTerminationSource } from './receipt-termination.policy.js';

export interface ReceiptRejectionAllocation {
  quantity: number;
  terminationReason: string | null;
}

export function planReceiptRejectionAllocations(
  sources: readonly ReceiptTerminationSource[],
  quantity: number,
): ReceiptRejectionAllocation[] {
  requireQuantity(quantity, '拒收实物量');
  const result: ReceiptRejectionAllocation[] = [];
  let remaining = quantity;
  // 先保留终止约束，数量校准后的其余实物统一形成普通人工拒收。
  for (const source of sources) {
    if (!source.terminationReason) continue;
    const retained = Math.min(remaining, source.remainingQuantity);
    if (retained <= 0) continue;
    result.push({ quantity: retained, terminationReason: source.terminationReason });
    remaining -= retained;
  }
  if (remaining > 0) result.push({ quantity: remaining, terminationReason: null });
  return result;
}
