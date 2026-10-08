import {
  requireRetainedReceiptOwnership,
  requireReceiptAllocationTarget,
  requiresFirstSupplementBinding,
  requireFirstSupplementBinding,
} from '../domain/receipt-allocation-ownership.policy.js';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { ReceiptAllocationInput } from '@company/contracts';
import { type ReceiptLineRow, type AllocationRow } from './mysql-receipt.shared.js';
import { receiptError } from '../domain/procurement.errors.js';
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
  const supplements = requireRetainedReceiptOwnership(
    sources.map((source) => {
      const owner = prior.get(String(source.id));
      return {
        purchaseOrderLineId: owner?.owner ?? null,
        isSupplement: owner?.supplement ?? false,
        remainingQuantity: source.remaining_quantity,
        terminationReason: source.termination_reason,
      };
    }),
    details,
    confirmedQuantity,
  );
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
    const eligible = requireReceiptAllocationTarget(
      target
        ? {
            status: target.status,
            supplierId: String(target.supplier_id),
            itemId: String(target.item_id),
            materialVariantId: String(target.material_variant_id),
            fulfillmentMode: target.fulfillment_mode,
            originOrderLineId:
              target.origin_order_line_id === null ? null : String(target.origin_order_line_id),
            originReceiptLineId:
              target.origin_receipt_line_id === null ? null : String(target.origin_receipt_line_id),
            plannedQuantity: Number(target.planned_quantity),
          }
        : null,
      {
        targetId,
        originOrderLineId: String(line.purchase_order_line_id),
        receiptLineId: String(line.id),
        supplierId: String(origin.supplier_id),
        itemId: String(line.item_id),
        materialVariantId: String(line.material_variant_id),
      },
    );
    if (requiresFirstSupplementBinding(eligible, targetId, supplements)) {
      const [[bound]] = await db.query<(RowDataPacket & { total: number })[]>(
        'SELECT COUNT(*) total FROM procurement_receipt_allocation WHERE purchase_order_line_id=?',
        [targetId],
      );
      requireFirstSupplementBinding(
        eligible,
        details.filter((row) => row.purchaseOrderLineId === targetId),
        Number(bound?.total ?? 0),
      );
    }
  }
}
