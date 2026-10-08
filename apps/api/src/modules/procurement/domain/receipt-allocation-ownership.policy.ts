import type {
  ReceiptAllocationInput,
  PurchaseOrderLineStatus,
  PurchaseFulfillmentMode,
} from '@company/contracts';
import { receiptError } from './procurement.errors.js';

export interface ReceiptOwnershipSource {
  purchaseOrderLineId: string | null;
  isSupplement: boolean;
  remainingQuantity: number;
  terminationReason: string | null;
}

/** Both finalization and rejection may only adjust retained supplements by the batch's net change. */
export function requireOwnershipNetChange(
  changes: readonly { previous: number; next: number }[],
  delta: number,
  messages: { direction: string; total: string },
): void {
  let changed = 0;
  for (const { previous, next } of changes) {
    const change = next - previous;
    if ((delta >= 0 && change < 0) || (delta <= 0 && change > 0))
      return receiptError(messages.direction);
    changed += Math.abs(change);
  }
  if (changed > Math.abs(delta)) return receiptError(messages.total);
}

export function requireRetainedReceiptOwnership(
  sources: readonly ReceiptOwnershipSource[],
  details: readonly ReceiptAllocationInput[],
  confirmedQuantity: number,
): ReadonlySet<string> {
  const supplements = new Map<string, number>();
  const terminated = new Map<string, number>();
  for (const source of sources) {
    const owner = source.purchaseOrderLineId;
    if (owner && source.isSupplement)
      supplements.set(owner, (supplements.get(owner) ?? 0) + source.remainingQuantity);
    if (source.terminationReason) {
      const id = owner ?? '';
      terminated.set(id, (terminated.get(id) ?? 0) + source.remainingQuantity);
    }
  }
  const delta = confirmedQuantity - sources.reduce((sum, row) => sum + row.remainingQuantity, 0);
  requireOwnershipNetChange(
    [...supplements].map(([owner, previous]) => ({
      previous,
      next: details
        .filter((row) => row.purchaseOrderLineId === owner)
        .reduce((sum, row) => sum + row.quantity, 0),
    })),
    delta,
    {
      direction: '已承接补单须保留采购归属；数量校准不能把未变化的实物改挂其他采购行',
      total: '已承接补单的数量调整合计不能超过本次整批数量差额',
    },
  );
  let removedTermination = 0;
  for (const [owner, oldQuantity] of terminated) {
    const next = details
      .filter(
        (row) =>
          (row.purchaseOrderLineId ?? '') === owner &&
          row.disposition === 'return' &&
          row.returnReason === 'procurement_termination',
      )
      .reduce((sum, row) => sum + row.quantity, 0);
    removedTermination += Math.max(0, oldQuantity - next);
  }
  if (removedTermination > Math.max(0, -delta))
    return receiptError('已指定采购终止的实物须保留终止待退；不能通过复检或重新分配恢复入库');
  return new Set(supplements.keys());
}

export interface ReceiptAllocationTarget {
  status: PurchaseOrderLineStatus;
  supplierId: string;
  itemId: string;
  materialVariantId: string;
  fulfillmentMode: PurchaseFulfillmentMode;
  originOrderLineId: string | null;
  originReceiptLineId: string | null;
  plannedQuantity: number;
}

export function requireReceiptAllocationTarget(
  target: ReceiptAllocationTarget | null,
  input: {
    targetId: string;
    originOrderLineId: string;
    receiptLineId: string;
    supplierId: string;
    itemId: string;
    materialVariantId: string;
  },
): ReceiptAllocationTarget {
  if (
    !target ||
    ['draft', 'cancelled'].includes(target.status) ||
    target.supplierId !== input.supplierId ||
    target.itemId !== input.itemId ||
    target.materialVariantId !== input.materialVariantId
  )
    return receiptError('分配采购行尚未生效或供应商、精确物料身份不符');
  if (
    input.targetId !== input.originOrderLineId &&
    (target.fulfillmentMode !== 'existing_receipt' ||
      target.originOrderLineId !== input.originOrderLineId ||
      target.originReceiptLineId !== input.receiptLineId)
  )
    return receiptError('只能分配给原采购行或承接本次到货的补单行');
  return target;
}

export function requiresFirstSupplementBinding(
  target: ReceiptAllocationTarget,
  targetId: string,
  retainedSupplements: ReadonlySet<string>,
): boolean {
  return target.fulfillmentMode === 'existing_receipt' && !retainedSupplements.has(targetId);
}

export function requireFirstSupplementBinding(
  target: ReceiptAllocationTarget,
  assigned: readonly ReceiptAllocationInput[],
  historicalAllocationCount: number,
): void {
  if (historicalAllocationCount > 0) return receiptError('该补单已承接过实物，不能重复绑定');
  if (
    target.status !== 'open' ||
    assigned.some((row) => row.disposition !== 'inbound') ||
    assigned.reduce((sum, row) => sum + row.quantity, 0) !== target.plannedQuantity
  )
    return receiptError('首次承接补单须以与采购量一致的可入库数量一次绑定到生效采购行');
}
