import type { ReceiptOwnershipInput } from '@company/contracts';
import { receiptError } from './procurement.errors.js';
import { requireQuantity } from './receipt-quantity.policy.js';
import { requireOwnershipNetChange } from './receipt-allocation-ownership.policy.js';

export interface ReceiptRejectionSource {
  purchaseOrderLineId: string | null;
  remainingQuantity: number;
  terminationReason: string | null;
}

export interface ReceiptRejectionAllocation {
  purchaseOrderLineId: string;
  quantity: number;
  terminationReason: string | null;
}

export function planReceiptRejectionAllocations(
  origin: string,
  sources: readonly ReceiptRejectionSource[],
  quantity: number,
  ownership?: readonly ReceiptOwnershipInput[],
): ReceiptRejectionAllocation[] {
  const owners = new Map<string, ReceiptRejectionSource[]>();
  for (const source of sources) {
    const id = source.purchaseOrderLineId ?? origin;
    const rows = owners.get(id) ?? [];
    rows.push(source);
    owners.set(id, rows);
  }
  if (!owners.size) owners.set(origin, []);
  const total = sources.reduce((sum, row) => sum + row.remainingQuantity, 0);
  const supplement = [...owners.keys()].some((id) => id !== origin);
  if (supplement && total !== quantity && !ownership)
    receiptError('本批总量变化且存在补单归属，请确认各采购行拒收量');
  const targets = new Map(
    [...owners].map(([id, rows]) => [
      id,
      rows.reduce((sum, row) => sum + row.remainingQuantity, 0),
    ]),
  );
  if (ownership) {
    if (
      ownership.length > 100 ||
      new Set(ownership.map((row) => row.purchaseOrderLineId)).size !== ownership.length
    )
      receiptError('采购归属不能重复且最多100行');
    for (const row of ownership) {
      requireQuantity(row.quantity, '采购归属数量', true);
      if (!owners.has(row.purchaseOrderLineId)) receiptError('拒收只能使用本批已有采购归属');
    }
    if (ownership.reduce((sum, row) => sum + row.quantity, 0) !== quantity)
      receiptError('采购归属合计须等于本批剩余量');
    requireOwnershipNetChange(
      [...targets]
        .filter(([id]) => id !== origin)
        .map(([id, previous]) => ({
          previous,
          next: ownership.find((row) => row.purchaseOrderLineId === id)?.quantity ?? 0,
        })),
      quantity - total,
      {
        direction: '不能将未变化的补单实物改挂其他采购行',
        total: '补单归属变动不能超过整批净差额',
      },
    );
    for (const id of targets.keys())
      targets.set(id, ownership.find((row) => row.purchaseOrderLineId === id)?.quantity ?? 0);
  } else if (total !== quantity) {
    targets.set(origin, quantity);
  }
  const result: ReceiptRejectionAllocation[] = [];
  // Preserve source order and each termination reason; combining owners would lose these boundaries.
  for (const [owner, target] of targets) {
    let remaining = target;
    for (const source of owners.get(owner) ?? []) {
      const qty = Math.min(remaining, source.remainingQuantity);
      if (qty <= 0) continue;
      result.push({
        purchaseOrderLineId: owner,
        quantity: qty,
        terminationReason: source.terminationReason,
      });
      remaining -= qty;
    }
    if (remaining > 0)
      result.push({ purchaseOrderLineId: owner, quantity: remaining, terminationReason: null });
  }
  return result;
}
