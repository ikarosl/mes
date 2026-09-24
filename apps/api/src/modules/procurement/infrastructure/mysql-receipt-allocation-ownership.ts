import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { ReceiptAllocationInput } from '@company/contracts';
import { receiptError, type ReceiptLineRow, type AllocationRow } from './mysql-receipt.shared.js';
import { sortedIds, type OrderLineRow } from './mysql-purchase-order.shared.js';

/** Validate retained commercial ownership against the last unconsumed allocation, not historical totals. */
export async function requireAllocationOwnership(
  db: PoolConnection,
  line: ReceiptLineRow,
  sources: AllocationRow[],
  details: ReceiptAllocationInput[],
  confirmedQuantity: number,
) {
  const allocationIds = sortedIds(sources.map((s) => String(s.id)));
  const prior = new Map<string, { owner: string | null; supplement: boolean }>();
  if (allocationIds.length) {
    const [rows] = await db.query<
      (RowDataPacket & {
        id: number;
        purchase_order_line_id: number | null;
        fulfillment_mode: string | null;
      })[]
    >(
      `SELECT a.id,a.purchase_order_line_id,p.fulfillment_mode FROM procurement_receipt_allocation a
      LEFT JOIN procurement_order_line p ON p.id=a.purchase_order_line_id
      WHERE a.id IN (${allocationIds.map(() => '?').join(',')}) FOR SHARE`,
      allocationIds,
    );
    for (const row of rows)
      prior.set(String(row.id), {
        owner: row.purchase_order_line_id ? String(row.purchase_order_line_id) : null,
        supplement: row.fulfillment_mode === 'existing_receipt',
      });
  }
  const supplements = new Map<string, number>();
  const terminated = new Map<string, number>();
  for (const scope of sources) {
    const owner = prior.get(String(scope.id));
    if (owner?.owner && owner.supplement)
      supplements.set(owner.owner, (supplements.get(owner.owner) ?? 0) + scope.remaining_quantity);
    if (scope.termination_reason) {
      const id = owner?.owner ?? '';
      terminated.set(id, (terminated.get(id) ?? 0) + scope.remaining_quantity);
    }
  }
  const oldTotal = sources.reduce((sum, s) => sum + s.remaining_quantity, 0);
  const delta = confirmedQuantity - oldTotal;
  let changedSupplementQuantity = 0;
  for (const [owner, oldQuantity] of supplements) {
    const next = details
      .filter((d) => d.purchaseOrderLineId === owner)
      .reduce((sum, d) => sum + d.quantity, 0);
    const change = next - oldQuantity;
    if ((delta >= 0 && change < 0) || (delta <= 0 && change > 0))
      return receiptError('已承接补单须保留采购归属；数量校准不能把未变化的实物改挂其他采购行');
    changedSupplementQuantity += Math.abs(change);
  }
  if (changedSupplementQuantity > Math.abs(delta))
    return receiptError('已承接补单的数量调整合计不能超过本次整批数量差额');
  let removedTermination = 0;
  for (const [owner, oldQuantity] of terminated) {
    const next = details
      .filter(
        (d) =>
          (d.purchaseOrderLineId ?? '') === owner &&
          d.disposition === 'return' &&
          d.returnReason === 'procurement_termination',
      )
      .reduce((sum, d) => sum + d.quantity, 0);
    removedTermination += Math.max(0, oldQuantity - next);
  }
  if (removedTermination > Math.max(0, -delta))
    return receiptError('已指定采购终止的实物须保留终止待退；不能通过复检或重新分配恢复入库');
  const [[origin]] = await db.query<OrderLineRow[]>(
    'SELECT * FROM procurement_order_line WHERE id=? FOR SHARE',
    [line.purchase_order_line_id],
  );
  if (!origin) return receiptError('原采购行不存在');
  const targetIds = sortedIds(
    details.flatMap((d) => (d.purchaseOrderLineId ? [d.purchaseOrderLineId] : [])),
  );
  for (const targetId of targetIds) {
    const [[target]] = await db.query<OrderLineRow[]>(
      'SELECT * FROM procurement_order_line WHERE id=? FOR UPDATE',
      [targetId],
    );
    if (
      !target ||
      ['draft', 'cancelled'].includes(target.status) ||
      String(target.supplier_id) !== String(origin.supplier_id) ||
      String(target.item_id) !== String(line.item_id) ||
      String(target.material_variant_id) !== String(line.material_variant_id)
    )
      return receiptError('分配采购行尚未生效或供应商、精确物料身份不符');
    if (
      targetId !== String(line.purchase_order_line_id) &&
      (target.fulfillment_mode !== 'existing_receipt' ||
        String(target.origin_order_line_id) !== String(line.purchase_order_line_id) ||
        String(target.origin_receipt_line_id) !== String(line.id))
    )
      return receiptError('只能分配给原采购行或承接本次到货的补单行');
    if (target.fulfillment_mode === 'existing_receipt' && !supplements.has(targetId)) {
      const [[bound]] = await db.query<(RowDataPacket & { total: number })[]>(
        'SELECT COUNT(*) total FROM procurement_receipt_allocation WHERE purchase_order_line_id=?',
        [targetId],
      );
      if (Number(bound?.total ?? 0) > 0) return receiptError('该补单已承接过实物，不能重复绑定');
      const assigned = details.filter((d) => d.purchaseOrderLineId === targetId);
      if (
        target.status !== 'open' ||
        assigned.some((d) => d.disposition !== 'inbound') ||
        assigned.reduce((sum, d) => sum + d.quantity, 0) !== Number(target.planned_quantity)
      )
        return receiptError('首次承接补单须以与采购量一致的可入库数量一次绑定到生效采购行');
    }
  }
}
