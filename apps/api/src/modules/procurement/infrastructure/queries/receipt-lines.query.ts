import { mapReceiptAcceptances } from './receipt-acceptance.query.js';
import { readDraftRoundOwnership, readAllocationRows } from './receipt-allocation.query.js';
import type {
  ProcurementReceiptLine,
  ReceiptQuantitySummary,
  ReceiptHistoryKind,
  QualityInboundCaseItem,
} from '@company/contracts';
import type { QualityInboundQuery } from '../../../quality/public.js';
import type { Db } from '../mysql-purchase-order.shared.js';
import {
  type ReadRow,
  LINE_COLUMNS,
  lineSelect,
  inboundFactSelect,
  INBOUND_FACT_COLUMNS,
  slots,
  text,
  nullableText,
  mapRevision,
  mapRound,
  mapAllocation,
  mapReturn,
  mapInbound,
} from './receipt-read.shared.js';

const groupRows = (rows: ReadRow[], key = 'receipt_line_id') => {
  const groups = new Map<string, ReadRow[]>();
  for (const row of rows) {
    const id = text(row[key]);
    const group = groups.get(id) ?? [];
    group.push(row);
    groups.set(id, group);
  }
  return groups;
};
export async function readReceiptLines(
  db: Db,
  quality: QualityInboundQuery,
  filter: { receiptId?: string; lineId?: string },
): Promise<ProcurementReceiptLine[]> {
  const [lines] = await db.query<ReadRow[]>(
    `${lineSelect(LINE_COLUMNS)} WHERE ${filter.receiptId ? 'line.receipt_id' : 'line.id'}=? ORDER BY line.line_no,line.id`,
    [filter.receiptId ?? filter.lineId],
  );
  if (!lines.length) return [];
  const ids = lines.map((row) => text(row.id));
  const marks = slots(ids);
  // Preview each line independently; complete histories have dedicated paged endpoints.
  const preview = async (table: string) =>
    (
      await db.query<ReadRow[]>(
        `SELECT ranked.* FROM (SELECT source.*,ROW_NUMBER() OVER(PARTITION BY receipt_line_id ORDER BY id DESC) preview_row,
      COUNT(*) OVER(PARTITION BY receipt_line_id) history_count FROM ${table} source WHERE receipt_line_id IN (${marks})) ranked WHERE preview_row<=10`,
        ids,
      )
    )[0];
  const roundRows = await preview('procurement_receipt_round');
  const rounds = groupRows(roundRows);
  const [currentRoundRows] = await db.query<ReadRow[]>(
    `SELECT r.* FROM procurement_receipt_round r JOIN procurement_receipt_line line ON line.current_round_id=r.id WHERE line.id IN (${marks})`,
    ids,
  );
  const currentRounds = new Map(currentRoundRows.map((row) => [text(row.receipt_line_id), row]));
  const revisions = groupRows(await preview('procurement_receipt_revision'));
  const returns = groupRows(await preview('procurement_supplier_return'));
  const acceptanceRows = await preview('procurement_receipt_acceptance');
  const acceptances = await mapReceiptAcceptances(db, acceptanceRows);
  const allAllocationRows = await readAllocationRows(db, ids);
  const allocationRows = allAllocationRows.filter((row) => Number(row.is_current) === 1);
  const allocations = groupRows(allocationRows);
  const draftOwners = await readDraftRoundOwnership(db, ids, allAllocationRows);
  const origins = new Map(lines.map((row) => [text(row.id), text(row.purchase_order_line_id)]));
  const ownershipByLine = new Map<string, Map<string, number>>();
  const addOwner = (lineId: string, ownerId: string, quantity: number) => {
    const owners = ownershipByLine.get(lineId) ?? new Map<string, number>();
    owners.set(ownerId, (owners.get(ownerId) ?? 0) + quantity);
    ownershipByLine.set(lineId, owners);
  };
  for (const scope of allocationRows)
    addOwner(
      text(scope.receipt_line_id),
      nullableText(scope.purchase_order_line_id) ?? origins.get(text(scope.receipt_line_id))!,
      Number(scope.quantity) - Number(scope.inbound_quantity) - Number(scope.returned_quantity),
    );
  for (const owner of draftOwners)
    if (owner.retainedQuantity > 0)
      addOwner(owner.receiptLineId, owner.purchaseOrderLineId, owner.retainedQuantity);
  const ownerIds = [
    ...new Set([...ownershipByLine.values()].flatMap((owners) => [...owners.keys()])),
  ];
  const ownerNames = new Map<string, string>();
  if (ownerIds.length) {
    const [owners] = await db.query<ReadRow[]>(
      `SELECT line.id,orders.purchase_no FROM procurement_order_line line JOIN procurement_order orders ON orders.id=line.purchase_order_id WHERE line.id IN (${slots(ownerIds)})`,
      ownerIds,
    );
    for (const owner of owners) ownerNames.set(text(owner.id), text(owner.purchase_no));
  }
  const consumedByLine = new Map<string, string>();
  const allocationTotals = new Map<string, number>();
  for (const row of allAllocationRows) {
    const id = text(row.receipt_line_id);
    allocationTotals.set(id, (allocationTotals.get(id) ?? 0) + 1);
    if (
      row.inspection_id !== null &&
      text(row.inspection_id) === text(currentRounds.get(id)?.inspection_id)
    )
      consumedByLine.set(
        id,
        String(
          Number(consumedByLine.get(id) ?? 0) +
            Number(row.inbound_quantity) +
            Number(row.returned_quantity),
        ),
      );
  }
  const [caseReferences] = await db.query<ReadRow[]>(
    `SELECT ranked.id,ranked.receipt_line_id,ranked.history_count FROM (
    SELECT q.id,q.receipt_line_id,q.status,ROW_NUMBER() OVER(PARTITION BY q.receipt_line_id ORDER BY q.id DESC) preview_row,
      COUNT(*) OVER(PARTITION BY q.receipt_line_id) history_count FROM quality_inspection_case q WHERE q.receipt_line_id IN (${marks})
    ) ranked WHERE ranked.preview_row<=10 OR ranked.status='reviewing' OR EXISTS(SELECT 1 FROM procurement_receipt_round current_round JOIN procurement_receipt_line current_line ON current_line.current_round_id=current_round.id JOIN quality_inspection_record current_record ON current_record.id=current_round.inspection_id WHERE current_record.case_id=ranked.id)`,
    ids,
  );
  const cases: QualityInboundCaseItem[] = [];
  for (let offset = 0; offset < caseReferences.length; offset += 100)
    cases.push(
      ...(await quality.getCases(
        caseReferences.slice(offset, offset + 100).map((r) => text(r.id)),
      )),
    );
  const casesByLine = new Map<string, QualityInboundCaseItem[]>();
  for (const item of cases) {
    const group = casesByLine.get(item.receiptLineId) ?? [];
    group.push(item);
    casesByLine.set(item.receiptLineId, group);
  }
  const caseTotals = new Map(
    caseReferences.map((r) => [text(r.receipt_line_id), Number(r.history_count)]),
  );
  const [inboundRows] = await db.query<ReadRow[]>(
    `SELECT ranked.* FROM (${inboundFactSelect(INBOUND_FACT_COLUMNS + ', ROW_NUMBER() OVER(PARTITION BY detail.procurement_receipt_line_id ORDER BY detail.id DESC) preview_row, COUNT(*) OVER(PARTITION BY detail.procurement_receipt_line_id) history_count')} AND detail.procurement_receipt_line_id IN (${marks})) ranked WHERE preview_row<=10`,
    ids,
  );
  const inbounds = groupRows(inboundRows);
  const [inboundSums] = await db.query<ReadRow[]>(
    `${inboundFactSelect('detail.procurement_receipt_line_id receipt_line_id,SUM(tx.quantity) quantity')}
    AND detail.procurement_receipt_line_id IN (${marks}) GROUP BY detail.procurement_receipt_line_id`,
    ids,
  );
  const inboundTotals = new Map(
    inboundSums.map((r) => [text(r.receipt_line_id), Number(r.quantity)]),
  );
  const [returnSums] = await db.query<ReadRow[]>(
    `SELECT receipt_line_id,SUM(returned_quantity) quantity,SUM(CASE WHEN reason_type='quality' THEN returned_quantity ELSE 0 END) quality_quantity
    FROM procurement_supplier_return WHERE receipt_line_id IN (${marks}) GROUP BY receipt_line_id`,
    ids,
  );
  const returnTotals = new Map(returnSums.map((r) => [text(r.receipt_line_id), r]));
  const [currentRevisions] = await db.query<ReadRow[]>(
    `SELECT revision.receipt_line_id,revision.received_quantity FROM procurement_receipt_revision revision
    JOIN procurement_receipt_line line ON line.current_receipt_revision_id=revision.id WHERE line.id IN (${marks})`,
    ids,
  );
  const received = new Map(
    currentRevisions.map((r) => [text(r.receipt_line_id), Number(r.received_quantity)]),
  );
  return lines.map((row) => {
    const id = text(row.id);
    const active = allocations.get(id) ?? [];
    const currentRound = currentRounds.get(id);
    if (!currentRound) throw new Error('到货明细缺少当前处理轮次');
    const lineCases = casesByLine.get(id) ?? [];
    const sum = (dispositions: string[]) =>
      active
        .filter((scope) => dispositions.includes(text(scope.disposition)))
        .reduce(
          (total, scope) =>
            total +
            Number(scope.quantity) -
            Number(scope.inbound_quantity) -
            Number(scope.returned_quantity),
          0,
        );
    const I = inboundTotals.get(id) ?? 0;
    const R = Number(returnTotals.get(id)?.quantity ?? 0);
    const pendingInbound = sum(['inbound']);
    const pendingReturn = sum(['return']);
    const unprocessed = Number(received.get(id) ?? 0) - I - R;
    const quantities: ReceiptQuantitySummary = {
      unprocessedQuantity: String(unprocessed),
      receivedQuantity: String(received.get(id) ?? 0),
      undeterminedQuantity: String(
        currentRound.status === 'finalized' ? sum(['pending']) : unprocessed,
      ),
      approvedQuantity: String(I + pendingInbound),
      inboundQuantity: String(I),
      returnDueQuantity: String(R + pendingReturn),
      returnedQuantity: String(R),
      qualityReturnedQuantity: String(returnTotals.get(id)?.quality_quantity ?? 0),
      pendingInboundQuantity: String(pendingInbound),
      pendingReturnQuantity: String(pendingReturn),
      hasOpenReview: ['reviewing', 'reinspection_required', 'quality_rejected'].includes(
        text(currentRound.status),
      ),
    };
    const historyTotals: Record<ReceiptHistoryKind, number> = {
      rounds: Number(rounds.get(id)?.[0]?.history_count ?? 0),
      acceptances: Number(
        acceptanceRows.find((row) => text(row.receipt_line_id) === id)?.history_count ?? 0,
      ),
      revisions: Number(revisions.get(id)?.[0]?.history_count ?? 0),
      allocations: allocationTotals.get(id) ?? 0,
      cases: caseTotals.get(id) ?? 0,
      returns: Number(returns.get(id)?.[0]?.history_count ?? 0),
      inbounds: Number(inbounds.get(id)?.[0]?.history_count ?? 0),
    };
    const ownershipSources = [...(ownershipByLine.get(id) ?? new Map<string, number>())].map(
      ([purchaseOrderLineId, quantity]) => ({
        purchaseOrderLineId,
        purchaseNo: ownerNames.get(purchaseOrderLineId)!,
        quantity: String(quantity),
      }),
    );
    return {
      id,
      receiptId: text(row.receipt_id),
      purchaseOrderId: text(row.purchase_order_id),
      purchaseOrderLineId: text(row.purchase_order_line_id),
      lineNo: Number(row.line_no),
      supplierId: text(row.supplier_id),
      supplierName: text(row.supplier_name),
      itemId: text(row.item_id),
      itemCode: text(row.item_code_snapshot),
      itemName: text(row.material_name),
      materialVariantId: text(row.material_variant_id),
      materialVariantCode: text(row.material_variant_code_snapshot),
      unit: text(row.unit_snapshot),
      supplierBatchCode: nullableText(row.supplier_batch_code),
      currentRound: mapRound(currentRound),
      currentInspectionConsumedQuantity: consumedByLine.get(id) ?? '0',
      ownershipSources,
      ownershipSourceQuantity: String(
        ownershipSources.reduce((sum, owner) => sum + Number(owner.quantity), 0),
      ),
      rounds: (rounds.get(id) ?? []).map(mapRound),
      currentReceiptRevisionId: text(row.current_receipt_revision_id),
      batchId: nullableText(row.batch_id),
      batchCode: nullableText(row.batch_code),
      overReceiptNote: nullableText(row.over_receipt_note),
      version: Number(row.version),
      quantities,
      acceptances: acceptances.filter((row) => row.receiptLineId === id),
      revisions: (revisions.get(id) ?? []).map(mapRevision),
      allocations: active.map(mapAllocation),
      cases: lineCases,
      returns: (returns.get(id) ?? []).map(mapReturn),
      inbounds: (inbounds.get(id) ?? []).map(mapInbound),
      historyTotals,
    };
  });
}
