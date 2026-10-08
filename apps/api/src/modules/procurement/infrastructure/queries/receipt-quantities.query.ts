import type { ReceiptQuantitySummary } from '@company/contracts';
import type { Db } from '../mysql-purchase-order.shared.js';
import { allocationInboundSum, allocationReturnedSum } from './receipt-allocation.query.js';
import { type ReadRow, inboundFactSelect, slots, text } from './receipt-read.shared.js';

export async function readReceiptQuantitySummaries(
  db: Db,
  ids: string[],
  currentRounds: Map<string, ReadRow>,
  allAllocationRows?: ReadRow[],
): Promise<Map<string, ReceiptQuantitySummary>> {
  const result = new Map<string, ReceiptQuantitySummary>();
  if (!ids.length) return result;
  const marks = slots(ids);
  const allocationRows = allAllocationRows
    ? allAllocationRows.filter((row) => Number(row.is_current) === 1)
    : (
        await db.query<ReadRow[]>(
          `SELECT a.receipt_line_id,a.disposition,a.quantity,
          ${allocationInboundSum()} inbound_quantity,${allocationReturnedSum()} returned_quantity
          FROM procurement_receipt_allocation a
          JOIN procurement_receipt_line line ON line.id=a.receipt_line_id
          JOIN procurement_receipt_round current_round ON current_round.id=line.current_round_id
          WHERE a.receipt_line_id IN (${marks}) AND a.round_id=current_round.id
            AND current_round.status='finalized'`,
          ids,
        )
      )[0];
  const activeByLine = new Map<string, ReadRow[]>();
  for (const row of allocationRows) {
    const id = text(row.receipt_line_id);
    activeByLine.set(id, [...(activeByLine.get(id) ?? []), row]);
  }
  const physical = await readReceiptPhysicalQuantities(db, ids);
  for (const id of ids) {
    const currentRound = currentRounds.get(id);
    if (!currentRound) throw new Error('到货明细缺少当前处理轮次');
    const active = activeByLine.get(id) ?? [];
    const remaining = (disposition: string) =>
      active
        .filter((row) => text(row.disposition) === disposition)
        .reduce(
          (total, row) =>
            total +
            Number(row.quantity) -
            Number(row.inbound_quantity) -
            Number(row.returned_quantity),
          0,
        );
    const facts = physical.get(id)!;
    const inbound = Number(facts.inboundQuantity);
    const returned = Number(facts.returnedQuantity);
    const unprocessed = Number(facts.unprocessedQuantity);
    const pendingInbound = remaining('inbound');
    const pendingReturn = remaining('return');
    result.set(id, {
      unprocessedQuantity: String(unprocessed),
      receivedQuantity: facts.receivedQuantity,
      undeterminedQuantity: String(
        currentRound.status === 'finalized' ? remaining('pending') : unprocessed,
      ),
      approvedQuantity: String(inbound + pendingInbound),
      inboundQuantity: String(inbound),
      returnDueQuantity: String(returned + pendingReturn),
      returnedQuantity: String(returned),
      qualityReturnedQuantity: facts.qualityReturnedQuantity,
      pendingInboundQuantity: String(pendingInbound),
      pendingReturnQuantity: String(pendingReturn),
      hasOpenReview: ['reviewing', 'reinspection_required', 'quality_rejected'].includes(
        text(currentRound.status),
      ),
    });
  }
  return result;
}

type ReceiptPhysicalQuantities = Pick<
  ReceiptQuantitySummary,
  | 'receivedQuantity'
  | 'inboundQuantity'
  | 'returnedQuantity'
  | 'unprocessedQuantity'
  | 'qualityReturnedQuantity'
>;
/** 只汇总真实实物事实；质检范围不需要读取正式分配。 */
export async function readReceiptPhysicalQuantities(
  db: Db,
  ids: string[],
): Promise<Map<string, ReceiptPhysicalQuantities>> {
  const result = new Map<string, ReceiptPhysicalQuantities>();
  if (!ids.length) return result;
  const marks = slots(ids);
  const [inboundSums] = await db.query<ReadRow[]>(
    `${inboundFactSelect('detail.procurement_receipt_line_id receipt_line_id,SUM(tx.quantity) quantity')}
    AND detail.procurement_receipt_line_id IN (${marks}) GROUP BY detail.procurement_receipt_line_id`,
    ids,
  );
  const inboundTotals = new Map(
    inboundSums.map((row) => [text(row.receipt_line_id), Number(row.quantity)]),
  );
  const [returnSums] = await db.query<ReadRow[]>(
    `SELECT receipt_line_id,SUM(returned_quantity) quantity,
      SUM(CASE WHEN reason_type='quality' THEN returned_quantity ELSE 0 END) quality_quantity
    FROM procurement_supplier_return WHERE receipt_line_id IN (${marks}) GROUP BY receipt_line_id`,
    ids,
  );
  const returnTotals = new Map(returnSums.map((row) => [text(row.receipt_line_id), row]));
  const [currentRevisions] = await db.query<ReadRow[]>(
    `SELECT revision.receipt_line_id,revision.received_quantity
    FROM procurement_receipt_revision revision
    JOIN procurement_receipt_line line ON line.current_receipt_revision_id=revision.id
    WHERE line.id IN (${marks})`,
    ids,
  );
  const receivedTotals = new Map(
    currentRevisions.map((row) => [text(row.receipt_line_id), Number(row.received_quantity)]),
  );
  for (const id of ids) {
    const received = receivedTotals.get(id) ?? 0;
    const inbound = inboundTotals.get(id) ?? 0;
    const returned = Number(returnTotals.get(id)?.quantity ?? 0);
    result.set(id, {
      receivedQuantity: String(received),
      inboundQuantity: String(inbound),
      returnedQuantity: String(returned),
      unprocessedQuantity: String(received - inbound - returned),
      qualityReturnedQuantity: String(returnTotals.get(id)?.quality_quantity ?? 0),
    });
  }
  return result;
}
