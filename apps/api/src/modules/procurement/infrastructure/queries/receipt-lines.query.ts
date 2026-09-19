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
  mapScope,
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
  const revisions = groupRows(await preview('procurement_receipt_revision'));
  const returns = groupRows(await preview('procurement_supplier_return'));
  const [scopeRows] = await db.query<ReadRow[]>(
    `SELECT * FROM procurement_receipt_scope WHERE receipt_line_id IN (${marks}) AND disposition IN('uninspected','reviewing','approved','quality_return','termination_return') ORDER BY id`,
    ids,
  );
  const scopes = groupRows(scopeRows);
  const [scopeCounts] = await db.query<ReadRow[]>(
    `SELECT receipt_line_id,COUNT(*) history_count FROM procurement_receipt_scope WHERE receipt_line_id IN (${marks}) GROUP BY receipt_line_id`,
    ids,
  );
  const scopeTotals = new Map(
    scopeCounts.map((r) => [text(r.receipt_line_id), Number(r.history_count)]),
  );
  const [caseReferences] = await db.query<ReadRow[]>(
    `SELECT ranked.id,ranked.receipt_line_id,ranked.history_count FROM (
    SELECT q.id,q.receipt_line_id,q.status,ROW_NUMBER() OVER(PARTITION BY q.receipt_line_id ORDER BY q.id DESC) preview_row,
      COUNT(*) OVER(PARTITION BY q.receipt_line_id) history_count FROM quality_inbound_case q WHERE q.receipt_line_id IN (${marks})
    ) ranked WHERE ranked.preview_row<=10 OR ranked.status='reviewing'`,
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
    const active = scopes.get(id) ?? [];
    const lineCases = casesByLine.get(id) ?? [];
    const sum = (dispositions: string[]) =>
      active
        .filter((scope) => dispositions.includes(text(scope.disposition)))
        .reduce((total, scope) => total + Number(scope.quantity), 0);
    const I = inboundTotals.get(id) ?? 0;
    const R = Number(returnTotals.get(id)?.quantity ?? 0);
    const pendingInbound = sum(['approved']);
    const pendingReturn = sum(['quality_return', 'termination_return']);
    const quantities: ReceiptQuantitySummary = {
      receivedQuantity: String(received.get(id) ?? 0),
      undeterminedQuantity: String(sum(['uninspected', 'reviewing'])),
      approvedQuantity: String(I + pendingInbound),
      inboundQuantity: String(I),
      returnDueQuantity: String(R + pendingReturn),
      returnedQuantity: String(R),
      qualityReturnedQuantity: String(returnTotals.get(id)?.quality_quantity ?? 0),
      pendingInboundQuantity: String(pendingInbound),
      pendingReturnQuantity: String(pendingReturn),
      hasOpenReview: lineCases.some((item) => item.status === 'reviewing'),
    };
    const historyTotals: Record<ReceiptHistoryKind, number> = {
      revisions: Number(revisions.get(id)?.[0]?.history_count ?? 0),
      scopes: scopeTotals.get(id) ?? 0,
      cases: caseTotals.get(id) ?? 0,
      returns: Number(returns.get(id)?.[0]?.history_count ?? 0),
      inbounds: Number(inbounds.get(id)?.[0]?.history_count ?? 0),
    };
    return {
      id,
      receiptId: text(row.receipt_id),
      purchaseOrderId: text(row.purchase_order_id),
      purchaseOrderLineId: text(row.purchase_order_line_id),
      lineNo: Number(row.line_no),
      itemId: text(row.item_id),
      itemCode: text(row.item_code_snapshot),
      itemName: text(row.material_name),
      materialVariantId: text(row.material_variant_id),
      materialVariantCode: text(row.material_variant_code_snapshot),
      unit: text(row.unit_snapshot),
      supplierBatchCode: nullableText(row.supplier_batch_code),
      currentReceiptRevisionId: text(row.current_receipt_revision_id),
      batchId: nullableText(row.batch_id),
      batchCode: nullableText(row.batch_code),
      overReceiptNote: nullableText(row.over_receipt_note),
      version: Number(row.version),
      quantities,
      revisions: (revisions.get(id) ?? []).map(mapRevision),
      scopes: active.map(mapScope),
      cases: lineCases,
      returns: (returns.get(id) ?? []).map(mapReturn),
      inbounds: (inbounds.get(id) ?? []).map(mapInbound),
      historyTotals,
    };
  });
}
