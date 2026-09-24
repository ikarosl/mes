import type { Db } from '../mysql-purchase-order.shared.js';
import { type ReadRow, slots, inboundFactSelect } from './receipt-read.shared.js';
import {
  projectDraftOwnership,
  type OwnershipRound,
  type OwnershipAllocation,
} from '../../domain/receipt-ownership.projection.js';

export const allocationInboundSum = (id = 'a.id') =>
  `COALESCE((${inboundFactSelect('SUM(tx.quantity)')} AND detail.procurement_allocation_id=${id}),0)`;
export const allocationReturnedSum = (id = 'a.id') =>
  `COALESCE((SELECT SUM(sr.returned_quantity) FROM procurement_supplier_return sr WHERE sr.allocation_id=${id}),0)`;
export const allocationRemaining = (id = 'a.id', quantity = 'a.quantity') =>
  `${quantity}-${allocationInboundSum(id)}-${allocationReturnedSum(id)}`;
export const allocationSelect =
  () => `SELECT a.*,COALESCE(h.after_receipt_revision_id,r.receipt_revision_id) receipt_revision_id,h.inspection_record_id inspection_id,
  (l.current_round_id=a.round_id AND r.status='finalized') is_current,o.purchase_no,
  ${allocationInboundSum()} inbound_quantity,${allocationReturnedSum()} returned_quantity
  FROM procurement_receipt_allocation a JOIN procurement_receipt_line l ON l.id=a.receipt_line_id
  JOIN procurement_receipt_round r ON r.id=a.round_id LEFT JOIN procurement_receipt_acceptance h ON h.id=a.acceptance_id
  LEFT JOIN procurement_order_line p ON p.id=a.purchase_order_line_id LEFT JOIN procurement_order o ON o.id=p.purchase_order_id`;
export async function readAllocationRows(db: Db, ids: string[]): Promise<ReadRow[]> {
  if (!ids.length) return [];
  const [rows] = await db.query<ReadRow[]>(
    `${allocationSelect()} WHERE a.receipt_line_id IN (${slots(ids)}) ORDER BY a.id`,
    ids,
  );
  return rows;
}
export async function readDraftRoundOwnership(db: Db, ids: string[], existing?: ReadRow[]) {
  if (!ids.length) return [];
  const [rounds] = await db.query<(ReadRow & OwnershipRound)[]>(
    `SELECT l.id receipt_line_id,l.purchase_order_line_id,r.id round_id,r.status,r.source_allocation_round_id,v.received_quantity FROM procurement_receipt_line l
      JOIN procurement_receipt_round r ON r.id=l.current_round_id JOIN procurement_receipt_revision v ON v.id=l.current_receipt_revision_id
      WHERE l.id IN (${slots(ids)}) AND r.status<>'finalized'`,
    ids,
  );
  return projectDraftOwnership(
    rounds,
    (existing ?? (await readAllocationRows(db, ids))) as (ReadRow & OwnershipAllocation)[],
  );
}
