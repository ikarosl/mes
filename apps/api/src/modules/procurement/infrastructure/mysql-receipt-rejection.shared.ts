import type { PoolConnection } from 'mysql2/promise';
import type { ReceiptOwnershipInput } from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import {
  insertAllocation,
  receiptError,
  requireQuantity,
  type AllocationRow,
  type ReceiptLineRow,
} from './mysql-receipt.shared.js';
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
  const origin = String(line.purchase_order_line_id);
  const owners = new Map<string, AllocationRow[]>();
  for (const source of sources) {
    const id = String(source.purchase_order_line_id ?? origin);
    owners.set(id, [...(owners.get(id) ?? []), source]);
  }
  if (!owners.size) owners.set(origin, []);
  const total = sources.reduce((sum, row) => sum + row.remaining_quantity, 0);
  const supplement = [...owners.keys()].some((id) => id !== origin);
  if (supplement && total !== quantity && !ownership)
    receiptError('本批总量变化且存在补单归属，请确认各采购行拒收量');
  const targets = new Map(
    [...owners].map(([id, rows]) => [
      id,
      rows.reduce((sum, row) => sum + row.remaining_quantity, 0),
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
    let changed = 0;
    const delta = quantity - total;
    for (const [id, old] of targets) {
      const next = ownership.find((row) => row.purchaseOrderLineId === id)?.quantity ?? 0;
      const diff = next - old;
      if (id !== origin) {
        if ((delta >= 0 && diff < 0) || (delta <= 0 && diff > 0))
          receiptError('不能将未变化的补单实物改挂其他采购行');
        changed += Math.abs(diff);
      }
      targets.set(id, next);
    }
    if (changed > Math.abs(delta)) receiptError('补单归属变动不能超过整批净差额');
  } else if (total !== quantity) {
    targets.set(origin, quantity);
  }
  let lineNo = 0;
  for (const [owner, target] of targets) {
    let remaining = target;
    const rows = owners.get(owner) ?? [];
    for (const source of rows) {
      const qty = Math.min(remaining, source.remaining_quantity);
      if (qty <= 0) continue;
      await insertAllocation(
        db,
        {
          receiptLineId: String(line.id),
          roundId: String(round.id),
          acceptanceId: null,
          lineNo: ++lineNo,
          purchaseOrderLineId: owner,
          disposition: 'return',
          quantity: qty,
          returnReason: 'manual_rejection',
          terminationReason: source.termination_reason,
          remark: reason,
        },
        context,
      );
      remaining -= qty;
    }
    if (remaining > 0)
      await insertAllocation(
        db,
        {
          receiptLineId: String(line.id),
          roundId: String(round.id),
          acceptanceId: null,
          lineNo: ++lineNo,
          purchaseOrderLineId: owner,
          disposition: 'return',
          quantity: remaining,
          returnReason: 'manual_rejection',
          remark: reason,
        },
        context,
      );
  }
}
