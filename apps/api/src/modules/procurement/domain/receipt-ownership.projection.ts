export interface OwnershipRound {
  receipt_line_id: string | number;
  purchase_order_line_id: string | number;
  round_id: string | number;
  status: string;
  source_allocation_round_id: string | number | null;
  received_quantity: string | number;
}
export interface OwnershipAllocation {
  id: string | number;
  receipt_line_id: string | number;
  round_id: string | number;
  purchase_order_line_id: string | number | null;
  quantity: string | number;
  inbound_quantity: string | number;
  returned_quantity: string | number;
}
export function projectDraftOwnership(
  rounds: OwnershipRound[],
  allocations: OwnershipAllocation[],
) {
  return rounds
    .filter((round) => round.status !== 'finalized')
    .flatMap((round) => {
      const rows = allocations.filter(
        (row) => String(row.receipt_line_id) === String(round.receipt_line_id),
      );
      const remaining =
        Number(round.received_quantity) -
        rows.reduce(
          (sum, row) => sum + Number(row.inbound_quantity) + Number(row.returned_quantity),
          0,
        );
      const sources = rows.filter(
        (row) =>
          round.source_allocation_round_id !== null &&
          String(row.round_id) === String(round.source_allocation_round_id),
      );
      const owners = new Map<string, { retainedQuantity: number; sourceAllocationIds: string[] }>();
      for (const row of sources) {
        const qty =
          Number(row.quantity) - Number(row.inbound_quantity) - Number(row.returned_quantity);
        if (qty <= 0) continue;
        const id = String(row.purchase_order_line_id ?? round.purchase_order_line_id);
        const value = owners.get(id) ?? { retainedQuantity: 0, sourceAllocationIds: [] };
        value.retainedQuantity += qty;
        value.sourceAllocationIds.push(String(row.id));
        owners.set(id, value);
      }
      const total = [...owners.values()].reduce((sum, owner) => sum + owner.retainedQuantity, 0);
      const origin = String(round.purchase_order_line_id);
      if (!owners.has(origin) && (total !== remaining || !owners.size))
        owners.set(origin, { retainedQuantity: 0, sourceAllocationIds: [] });
      return [...owners].map(([purchaseOrderLineId, value]) => ({
        receiptLineId: String(round.receipt_line_id),
        roundId: String(round.round_id),
        purchaseOrderLineId,
        quantity:
          total === remaining
            ? value.retainedQuantity
            : purchaseOrderLineId === origin
              ? remaining
              : 0,
        ...value,
        hasOpenReview: remaining > 0 || value.retainedQuantity > 0,
      }));
    });
}
