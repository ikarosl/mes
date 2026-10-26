import type { ReceiptInspectionExecution, ReceiptQuantitySummary } from '@company/contracts';
import type { Db } from '../mysql-purchase-order.shared.js';
import { allocationInboundSum, allocationReturnedSum } from './receipt-allocation.query.js';
import { type ReadRow, inboundFactSelect, slots, text } from './receipt-read.shared.js';

const receiptInboundTotalsSelect = (where = ''): string =>
  `${inboundFactSelect('detail.procurement_receipt_line_id receipt_line_id,SUM(tx.quantity) quantity')}
    ${where} GROUP BY detail.procurement_receipt_line_id`;
const receiptReturnTotalsSelect = (where = '', includeQualityQuantity = true): string =>
  `SELECT receipt_line_id,SUM(returned_quantity) quantity${
    includeQualityQuantity
      ? ",SUM(CASE WHEN reason_type='quality' THEN returned_quantity ELSE 0 END) quality_quantity"
      : ''
  }
  FROM procurement_supplier_return ${where} GROUP BY receipt_line_id`;
/** 供分页前的阶段筛选使用；与实物数量投影共用库存流水及退回事实。 */
export const receiptPhysicalQuantityJoins = (): string =>
  `JOIN procurement_receipt_revision current_revision
    ON current_revision.id=line.current_receipt_revision_id AND current_revision.receipt_line_id=line.id
  LEFT JOIN (${receiptInboundTotalsSelect()}) physical_inbound ON physical_inbound.receipt_line_id=line.id
  LEFT JOIN (${receiptReturnTotalsSelect()}) physical_returns ON physical_returns.receipt_line_id=line.id`;
export const RECEIPT_UNPROCESSED_QUANTITY =
  '(current_revision.received_quantity-COALESCE(physical_inbound.quantity,0)-COALESCE(physical_returns.quantity,0))';

/** 目录仅判断是否仍有实物；按指定到货行汇总真实已入与已退之和，不读取修订或质量分量。 */
export async function readReceiptProcessedQuantities(
  db: Db,
  ids: string[],
): Promise<Map<string, number>> {
  const result = new Map(ids.map((id) => [id, 0]));
  if (!ids.length) return result;
  const marks = slots(ids);
  const [inboundSums] = await db.query<ReadRow[]>(
    receiptInboundTotalsSelect(`AND detail.procurement_receipt_line_id IN (${marks})`),
    ids,
  );
  const [returnSums] = await db.query<ReadRow[]>(
    receiptReturnTotalsSelect(`WHERE receipt_line_id IN (${marks})`, false),
    ids,
  );
  for (const row of [...inboundSums, ...returnSums]) {
    const id = text(row.receipt_line_id);
    result.set(id, (result.get(id) ?? 0) + Number(row.quantity));
  }
  return result;
}

export async function readReceiptQuantitySummaries(
  db: Db,
  ids: string[],
  currentRounds: Map<string, ReadRow>,
  currentAllocationRows?: ReadRow[],
): Promise<Map<string, ReceiptQuantitySummary>> {
  const result = new Map<string, ReceiptQuantitySummary>();
  if (!ids.length) return result;
  const marks = slots(ids);
  const allocationRows =
    currentAllocationRows ??
    (
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
    let undetermined = unprocessed;
    if (currentRound.status === 'voided') undetermined = 0;
    else if (currentRound.status === 'finalized') undetermined = remaining('pending');
    result.set(id, {
      unprocessedQuantity: String(unprocessed),
      receivedQuantity: facts.receivedQuantity,
      undeterminedQuantity: String(undetermined),
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

/** 当前明确采用的检验只抵扣引用它的真实执行，不装载历史分配。 */
export async function readReceiptInspectionExecution(
  db: Db,
  receiptLineId: string,
  inspectionId: string | null,
): Promise<ReceiptInspectionExecution> {
  if (inspectionId === null)
    return { inboundQuantity: '0', qualityReturnedQuantity: '0', otherReturnedQuantity: '0' };
  const [[inbound]] = await db.query<ReadRow[]>(
    `${inboundFactSelect('COALESCE(SUM(tx.quantity),0) quantity')}
      AND detail.procurement_receipt_line_id=? AND detail.procurement_inspection_id=?`,
    [receiptLineId, inspectionId],
  );
  const [[returns]] = await db.query<ReadRow[]>(
    `SELECT COALESCE(SUM(CASE WHEN reason_type='quality' THEN returned_quantity ELSE 0 END),0) quality_quantity,
      COALESCE(SUM(CASE WHEN reason_type<>'quality' THEN returned_quantity ELSE 0 END),0) other_quantity
      FROM procurement_supplier_return WHERE receipt_line_id=? AND inspection_id=?`,
    [receiptLineId, inspectionId],
  );
  return {
    inboundQuantity: String(Number(inbound?.quantity ?? 0)),
    qualityReturnedQuantity: String(Number(returns?.quality_quantity ?? 0)),
    otherReturnedQuantity: String(Number(returns?.other_quantity ?? 0)),
  };
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
    receiptInboundTotalsSelect(`AND detail.procurement_receipt_line_id IN (${marks})`),
    ids,
  );
  const inboundTotals = new Map(
    inboundSums.map((row) => [text(row.receipt_line_id), Number(row.quantity)]),
  );
  const [returnSums] = await db.query<ReadRow[]>(
    receiptReturnTotalsSelect(`WHERE receipt_line_id IN (${marks})`),
    ids,
  );
  const returnTotals = new Map(returnSums.map((row) => [text(row.receipt_line_id), row]));
  const [currentRevisions] = await db.query<ReadRow[]>(
    `SELECT revision.receipt_line_id,
      CASE WHEN receipt.is_voided=0 THEN revision.received_quantity ELSE 0 END received_quantity
    FROM procurement_receipt_revision revision
    JOIN procurement_receipt_line line ON line.current_receipt_revision_id=revision.id
    JOIN procurement_receipt receipt ON receipt.id=line.receipt_id
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
