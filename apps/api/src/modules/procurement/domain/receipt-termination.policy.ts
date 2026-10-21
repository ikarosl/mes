import type { ReceiptAllocationInput } from '@company/contracts';
import { receiptError } from './procurement.errors.js';

export interface ReceiptTerminationSource {
  remainingQuantity: number;
  terminationReason: string | null;
}

/** 已指定终止的剩余实物只可随本次核实总量的净减少而减少。 */
export function requireRetainedReceiptTermination(
  sources: readonly ReceiptTerminationSource[],
  details: readonly ReceiptAllocationInput[],
  confirmedQuantity: number,
): void {
  const sourceQuantity = sources.reduce((sum, row) => sum + row.remainingQuantity, 0);
  const terminatedQuantity = sources.reduce(
    (sum, row) => sum + (row.terminationReason ? row.remainingQuantity : 0),
    0,
  );
  const retainedQuantity = details
    .filter((row) => row.disposition === 'return' && row.returnReason === 'procurement_termination')
    .reduce((sum, row) => sum + row.quantity, 0);
  if (terminatedQuantity - retainedQuantity > Math.max(0, sourceQuantity - confirmedQuantity))
    receiptError('已指定采购终止的实物须保留终止待退；不能通过复检或重新分配恢复入库');
}
