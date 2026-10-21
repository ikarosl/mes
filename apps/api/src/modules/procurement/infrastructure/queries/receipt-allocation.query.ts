import type { Db } from '../mysql-purchase-order.shared.js';
import { type ReadRow, slots, inboundFactSelect } from './receipt-read.shared.js';

export const allocationInboundSum = (id = 'a.id') =>
  `COALESCE((${inboundFactSelect('SUM(tx.quantity)')} AND detail.procurement_allocation_id=${id}),0)`;
export const allocationReturnedSum = (id = 'a.id') =>
  `COALESCE((SELECT SUM(sr.returned_quantity) FROM procurement_supplier_return sr WHERE sr.allocation_id=${id}),0)`;
export const allocationRemaining = (id = 'a.id', quantity = 'a.quantity') =>
  `${quantity}-${allocationInboundSum(id)}-${allocationReturnedSum(id)}`;
export const allocationSelect =
  () => `SELECT a.*,COALESCE(h.after_receipt_revision_id,r.receipt_revision_id) receipt_revision_id,h.inspection_record_id inspection_id,
  (l.current_round_id=a.round_id AND r.status='finalized') is_current,
  ${allocationInboundSum()} inbound_quantity,${allocationReturnedSum()} returned_quantity
  FROM procurement_receipt_allocation a JOIN procurement_receipt_line l ON l.id=a.receipt_line_id
  JOIN procurement_receipt_round r ON r.id=a.round_id LEFT JOIN procurement_receipt_acceptance h ON h.id=a.acceptance_id`;
export async function readAllocationRows(db: Db, ids: string[]): Promise<ReadRow[]> {
  if (!ids.length) return [];
  const [rows] = await db.query<ReadRow[]>(
    `${allocationSelect()} WHERE a.receipt_line_id IN (${slots(ids)}) ORDER BY a.id`,
    ids,
  );
  return rows;
}
