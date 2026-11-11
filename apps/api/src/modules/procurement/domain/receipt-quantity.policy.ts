import { MAX_PERSISTED_INTEGER_QUANTITY } from '@company/utils';
import { receiptError } from './procurement.errors.js';

export function requireQuantity(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_PERSISTED_INTEGER_QUANTITY)
    receiptError(`${label}必须是1～${MAX_PERSISTED_INTEGER_QUANTITY}的整数`);
}
