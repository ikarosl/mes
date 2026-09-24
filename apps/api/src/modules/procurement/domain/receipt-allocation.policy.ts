import type { ReceiptAllocationInput } from '@company/contracts';
import { RECEIPT_ALLOCATION_DISPOSITIONS, RECEIPT_RETURN_REASONS } from '@company/constants';
import { MAX_PERSISTED_INTEGER_QUANTITY } from '@company/utils';
import { ProcurementDomainError } from './procurement.errors.js';

const invalid = (message: string): never => {
  throw new ProcurementDomainError('INVALID_RECEIPT', message);
};

/** Warehouse owns the final quantities; immutable quality counts are advisory, not partitions. */
export function allocateReceiptQuantities(
  details: ReceiptAllocationInput[],
  confirmedQuantity: number,
): ReceiptAllocationInput[] {
  if (
    !Number.isSafeInteger(confirmedQuantity) ||
    confirmedQuantity < 0 ||
    confirmedQuantity > MAX_PERSISTED_INTEGER_QUANTITY
  )
    invalid('核实实物量必须为有效非负整数');
  if (details.length > 100) invalid('一次最多分配 100 条明细');
  let total = 0;
  for (const row of details) {
    if (
      !Number.isSafeInteger(row.quantity) ||
      row.quantity < 1 ||
      row.quantity > MAX_PERSISTED_INTEGER_QUANTITY
    )
      invalid('分配数量必须为有效正整数');
    if (
      !RECEIPT_ALLOCATION_DISPOSITIONS.includes(row.disposition) ||
      (row.disposition === 'return'
        ? !row.returnReason ||
          row.returnReason === 'manual_rejection' ||
          !RECEIPT_RETURN_REASONS.includes(row.returnReason)
        : row.returnReason !== null)
    )
      invalid('分配用途与退回原因不一致；人工拒收请使用整批拒收入口');
    if (row.disposition === 'inbound' && !row.purchaseOrderLineId)
      invalid('可入库数量必须有正式采购行');
    total += row.quantity;
  }
  if (total !== confirmedQuantity) invalid('可入库、待退回和待处理数量合计必须等于本轮核实实物量');
  return details.map((row) => ({ ...row }));
}
