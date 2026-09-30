import { mapReceiptAcceptances } from './receipt-acceptance.query.js';
import { readDraftRoundOwnership, readAllocationRows } from './receipt-allocation.query.js';
import type {
  ProcurementReceiptLine,
  ReceiptHistoryKind,
  QualityInboundCaseItem,
} from '@company/contracts';
import type { QualityInboundQuery } from '../../../quality/public.js';
import type { Db } from '../mysql-purchase-order.shared.js';
import {
  type ReadRow,
  LINE_COLUMNS,
  lineSelect,
  readCurrentRounds,
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
import { readReceiptQuantitySummaries } from './receipt-quantities.query.js';
import { readPurchaseLineMetrics } from './purchase-order-metrics.query.js';
import { summarizeReceiptInspectionExecution } from '../../domain/receipt-inspection-suggestion.policy.js';

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
    `${lineSelect(LINE_COLUMNS + ',pol.planned_quantity original_planned_quantity')} WHERE ${filter.receiptId ? 'line.receipt_id' : 'line.id'}=? ORDER BY line.line_no,line.id`,
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
  const currentRounds = await readCurrentRounds(db, ids);
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
  const executionRowsByLine = groupRows(allAllocationRows);
  const allocationTotals = new Map<string, number>();
  for (const row of allAllocationRows) {
    const id = text(row.receipt_line_id);
    allocationTotals.set(id, (allocationTotals.get(id) ?? 0) + 1);
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
  const [batchRows] = await db.query<ReadRow[]>(
    `${inboundFactSelect('DISTINCT detail.procurement_receipt_line_id receipt_line_id,detail.batch_id,batch.batch_code')}
    AND detail.procurement_receipt_line_id IN (${marks})`,
    ids,
  );
  const batches = groupRows(batchRows);

  const quantitySummaries = await readReceiptQuantitySummaries(
    db,
    ids,
    currentRounds,
    allAllocationRows,
  );
  const originalLineMetrics = await readPurchaseLineMetrics(db, [
    ...new Set(lines.map((row) => text(row.purchase_order_line_id))),
  ]);
  return lines.map((row) => {
    const id = text(row.id);
    const active = allocations.get(id) ?? [];
    const currentRound = currentRounds.get(id);
    if (!currentRound) throw new Error('到货明细缺少当前处理轮次');
    const execution = summarizeReceiptInspectionExecution(
      (executionRowsByLine.get(id) ?? []).map((allocation) => ({
        inspectionId: nullableText(allocation.inspection_id),
        inboundQuantity: Number(allocation.inbound_quantity),
        returnedQuantity: Number(allocation.returned_quantity),
        returnReason: nullableText(allocation.return_reason),
      })),
      nullableText(currentRound.inspection_id),
    );
    const lineCases = casesByLine.get(id) ?? [];
    const quantities = quantitySummaries.get(id);
    if (!quantities) throw new Error('到货明细缺少数量投影');
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
      receiptNo: text(row.receipt_no),
      purchaseOrderId: text(row.purchase_order_id),
      purchaseNo: text(row.purchase_no),
      purchaseOrderLineId: text(row.purchase_order_line_id),
      originalRemainingPlannedQuantity: String(
        Math.max(
          0,
          Number(row.original_planned_quantity) -
            Number(
              originalLineMetrics.get(text(row.purchase_order_line_id))?.quantities
                .approvedQuantity ?? 0,
            ),
        ),
      ),
      purchaseOrderLineNo: Number(row.purchase_order_line_no),
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
      currentInspectionExecution: {
        inboundQuantity: String(execution.inboundQuantity),
        qualityReturnedQuantity: String(execution.qualityReturnedQuantity),
        otherReturnedQuantity: String(execution.otherReturnedQuantity),
      },
      ownershipSources,
      ownershipSourceQuantity: String(
        ownershipSources.reduce((sum, owner) => sum + Number(owner.quantity), 0),
      ),
      rounds: (rounds.get(id) ?? []).map(mapRound),
      currentReceiptRevisionId: text(row.current_receipt_revision_id),
      batches: (batches.get(id) ?? []).map((fact) => ({
        batchId: text(fact.batch_id),
        batchCode: text(fact.batch_code),
      })),
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
