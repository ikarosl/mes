import { readDraftRoundOwnership, readAllocationRows } from './receipt-allocation.query.js';
import type { ReceiptQuantitySummary } from '@company/contracts';
import type { Db } from '../mysql-purchase-order.shared.js';
import { type ReadRow, slots, text, inboundFactSelect } from './receipt-read.shared.js';

export async function readPurchaseLineMetrics(
  db: Db,
  lineIds: string[],
): Promise<Map<string, { quantities: ReceiptQuantitySummary; hasReceipt: boolean }>> {
  const result = new Map(
    lineIds.map((id) => [
      id,
      {
        hasReceipt: false,
        quantities: {
          unprocessedQuantity: '0',
          receivedQuantity: '0',
          undeterminedQuantity: '0',
          approvedQuantity: '0',
          inboundQuantity: '0',
          returnDueQuantity: '0',
          returnedQuantity: '0',
          qualityReturnedQuantity: '0',
          pendingInboundQuantity: '0',
          pendingReturnQuantity: '0',
          hasOpenReview: false,
        },
      },
    ]),
  );
  if (!lineIds.length) return result;
  // Physical quantities are counted once, against their current formal allocation (or original source before confirmation).
  const [physical] = await db.query<ReadRow[]>(
    `SELECT DISTINCT purchase_order_line_id FROM procurement_receipt_line WHERE purchase_order_line_id IN (${slots(lineIds)})
      UNION SELECT DISTINCT purchase_order_line_id FROM procurement_receipt_allocation WHERE purchase_order_line_id IN (${slots(lineIds)})`,
    [...lineIds, ...lineIds],
  );
  for (const row of physical) result.get(text(row.purchase_order_line_id))!.hasReceipt = true;
  const [related] = await db.query<ReadRow[]>(
    `SELECT l.id FROM procurement_receipt_line l WHERE l.purchase_order_line_id IN (${slots(lineIds)})
    OR EXISTS(SELECT 1 FROM procurement_receipt_allocation a WHERE a.receipt_line_id=l.id AND a.purchase_order_line_id IN (${slots(lineIds)}))`,
    [...lineIds, ...lineIds],
  );
  const rows = await readAllocationRows(
    db,
    related.map((row) => text(row.id)),
  );
  const [origins] = await db.query<ReadRow[]>(
    `SELECT id,purchase_order_line_id FROM procurement_receipt_line WHERE id IN (${slots(related.map((row) => text(row.id))) || 'NULL'})`,
    related.map((row) => row.id),
  );
  const originById = new Map(
    origins.map((row) => [text(row.id), text(row.purchase_order_line_id)]),
  );
  const add = (
    id: string,
    field: Exclude<keyof ReceiptQuantitySummary, 'hasOpenReview'>,
    quantity: unknown,
  ) => {
    const target = result.get(id)!;
    target.quantities[field] = String(Number(target.quantities[field]) + Number(quantity ?? 0));
  };
  for (const row of rows) {
    const id = String(row.purchase_order_line_id ?? originById.get(text(row.receipt_line_id)));
    if (!result.has(id)) continue;
    const rest =
      Number(row.is_current) === 1
        ? Number(row.quantity) - Number(row.inbound_quantity) - Number(row.returned_quantity)
        : 0;
    add(
      id,
      'receivedQuantity',
      rest + Number(row.inbound_quantity) + Number(row.returned_quantity),
    );
    if (row.disposition === 'inbound') add(id, 'pendingInboundQuantity', rest);
    else if (row.disposition === 'return') add(id, 'pendingReturnQuantity', rest);
    else add(id, 'undeterminedQuantity', rest);
  }
  const [inbounds] = await db.query<ReadRow[]>(
    `${inboundFactSelect('allocation.purchase_order_line_id,SUM(tx.quantity) quantity').replace('  WHERE inbound.source_type', ' JOIN procurement_receipt_allocation allocation ON allocation.id=detail.procurement_allocation_id WHERE inbound.source_type')}
      AND allocation.purchase_order_line_id IN (${slots(lineIds)}) GROUP BY allocation.purchase_order_line_id`,
    lineIds,
  );
  for (const row of inbounds)
    add(text(row.purchase_order_line_id), 'inboundQuantity', row.quantity);
  const [returns] = await db.query<ReadRow[]>(
    `SELECT COALESCE(a.purchase_order_line_id,r.purchase_order_line_id) purchase_order_line_id,SUM(sr.returned_quantity) quantity,
      SUM(CASE WHEN sr.reason_type='quality' THEN sr.returned_quantity ELSE 0 END) quality_quantity
     FROM procurement_supplier_return sr JOIN procurement_receipt_line r ON r.id=sr.receipt_line_id
     LEFT JOIN procurement_receipt_allocation a ON a.id=sr.allocation_id
     WHERE COALESCE(a.purchase_order_line_id,r.purchase_order_line_id) IN (${slots(lineIds)}) GROUP BY COALESCE(a.purchase_order_line_id,r.purchase_order_line_id)`,
    lineIds,
  );
  for (const row of returns) {
    add(text(row.purchase_order_line_id), 'returnedQuantity', row.quantity);
    add(text(row.purchase_order_line_id), 'qualityReturnedQuantity', row.quality_quantity);
  }
  const [pendingLines] = await db.query<ReadRow[]>(
    `SELECT r.id FROM procurement_receipt_line r JOIN procurement_receipt_round round ON round.id=r.current_round_id
      WHERE round.status<>'finalized'
      AND (r.purchase_order_line_id IN (${slots(lineIds)}) OR EXISTS(
      SELECT 1 FROM procurement_receipt_allocation a WHERE a.receipt_line_id=r.id AND a.purchase_order_line_id IN (${slots(lineIds)})))`,
    [...lineIds, ...lineIds],
  );
  const pendingOwners = await readDraftRoundOwnership(
    db,
    pendingLines.map((row) => text(row.id)),
  );
  for (const owner of pendingOwners) {
    const target = result.get(owner.purchaseOrderLineId);
    if (!target) continue;
    target.hasReceipt = true;
    add(owner.purchaseOrderLineId, 'receivedQuantity', owner.quantity);
    add(owner.purchaseOrderLineId, 'undeterminedQuantity', owner.quantity);
    target.quantities.hasOpenReview ||= owner.hasOpenReview;
  }
  for (const value of result.values()) {
    const q = value.quantities;
    q.unprocessedQuantity = String(
      Number(q.undeterminedQuantity) +
        Number(q.pendingInboundQuantity) +
        Number(q.pendingReturnQuantity),
    );
    q.approvedQuantity = String(Number(q.inboundQuantity) + Number(q.pendingInboundQuantity));
    q.returnDueQuantity = String(Number(q.returnedQuantity) + Number(q.pendingReturnQuantity));
  }
  return result;
}
