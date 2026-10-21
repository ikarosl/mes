import { MAX_PERSISTED_INTEGER_QUANTITY } from '@company/utils';
import { receiptError } from './procurement.errors.js';

export function requireQuantity(value: number, label: string, allowZero = false): void {
  if (
    !Number.isSafeInteger(value) ||
    value < (allowZero ? 0 : 1) ||
    value > MAX_PERSISTED_INTEGER_QUANTITY
  )
    receiptError(`${label}必须是${allowZero ? '0' : '1'}～${MAX_PERSISTED_INTEGER_QUANTITY}的整数`);
}

export function requireAggregateQuantity(values: readonly number[], label: string): number {
  for (const value of values) requireQuantity(value, label, true);
  const total = values.reduce((sum, value) => sum + BigInt(value), 0n);
  if (total > BigInt(MAX_PERSISTED_INTEGER_QUANTITY))
    return receiptError(
      `${label}超过系统数量存储上限 ${MAX_PERSISTED_INTEGER_QUANTITY}，此限制与采购计划量无关`,
    );
  return Number(total);
}

export interface ReceiptExecutionQuantity {
  inboundQuantity: number;
  returnedQuantity: number;
}

export interface ReceiptBalance {
  inbound: number;
  returned: number;
  remaining: number;
}

export function calculateReceiptBalance(
  receivedQuantity: number,
  allocations: readonly ReceiptExecutionQuantity[],
): ReceiptBalance {
  const inbound = allocations.reduce((sum, row) => sum + row.inboundQuantity, 0);
  const returned = allocations.reduce((sum, row) => sum + row.returnedQuantity, 0);
  const remaining = receivedQuantity - inbound - returned;
  requireQuantity(remaining, '本批未处置量', true);
  return { inbound, returned, remaining };
}
