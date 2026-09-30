import type {
  PageQuery,
  PageResult,
  ReceiptAcceptanceItem,
  ReceiptAllocationCandidate,
  ReceiptAllocationCandidateQuery,
  ReceiptAllocationCandidateResult,
} from '@company/contracts';
import type { Db } from '../mysql-purchase-order.shared.js';
import { type ReadRow, text, nullableText, date, slots, pageInput } from './receipt-read.shared.js';

export async function mapReceiptAcceptances(
  db: Db,
  headers: ReadRow[],
): Promise<ReceiptAcceptanceItem[]> {
  if (!headers.length) return [];
  const [details] = await db.query<ReadRow[]>(
    `SELECT d.*,o.purchase_no FROM procurement_receipt_allocation d
     LEFT JOIN procurement_order_line p ON p.id=d.purchase_order_line_id LEFT JOIN procurement_order o ON o.id=p.purchase_order_id
     WHERE d.acceptance_id IN (${slots(headers.map((row) => text(row.id)))}) ORDER BY d.acceptance_id,d.line_no`,
    headers.map((row) => row.id),
  );
  return headers.map((row) => ({
    id: text(row.id),
    receiptLineId: text(row.receipt_line_id),
    inspectionId: text(row.inspection_record_id),
    roundId: text(row.round_id),
    overrideReason: nullableText(row.override_reason),
    beforeReceiptRevisionId: text(row.before_receipt_revision_id),
    afterReceiptRevisionId: text(row.after_receipt_revision_id),
    confirmedScopeQuantity: text(row.confirmed_scope_quantity),
    previousAcceptanceId: nullableText(row.previous_acceptance_id),
    remark: text(row.remark),
    createdBy: text(row.created_by),
    createdAt: date(row.created_at),
    details: details
      .filter((detail) => text(detail.acceptance_id) === text(row.id))
      .map((detail) => ({
        id: text(detail.id),
        purchaseOrderLineId: nullableText(detail.purchase_order_line_id),
        purchaseNo: nullableText(detail.purchase_no),
        disposition: detail.disposition as ReceiptAcceptanceItem['details'][number]['disposition'],
        quantity: text(detail.quantity),
        returnReason:
          detail.return_reason as ReceiptAcceptanceItem['details'][number]['returnReason'],
        remark: nullableText(detail.remark),
      })),
  }));
}

export async function readReceiptAcceptances(
  db: Db,
  receiptLineId: string,
  query: PageQuery,
): Promise<PageResult<ReceiptAcceptanceItem>> {
  const { page, pageSize } = pageInput(query);
  const [[count]] = await db.query<ReadRow[]>(
    'SELECT COUNT(*) total FROM procurement_receipt_acceptance WHERE receipt_line_id=?',
    [receiptLineId],
  );
  const [headers] = await db.query<ReadRow[]>(
    'SELECT * FROM procurement_receipt_acceptance WHERE receipt_line_id=? ORDER BY id DESC LIMIT ? OFFSET ?',
    [receiptLineId, pageSize, (page - 1) * pageSize],
  );
  return {
    items: await mapReceiptAcceptances(db, headers),
    total: Number(count?.total ?? 0),
    page,
    pageSize,
  };
}

export async function listReceiptAllocationCandidates(
  db: Db,
  receiptLineId: string,
  query: ReceiptAllocationCandidateQuery,
): Promise<ReceiptAllocationCandidateResult> {
  const keyword = query.keyword?.trim();
  const from = `FROM procurement_receipt_line r JOIN procurement_order_line p ON
    (p.id=r.purchase_order_line_id OR (p.origin_order_line_id=r.purchase_order_line_id AND p.origin_receipt_line_id=r.id AND p.fulfillment_mode='existing_receipt'))
    JOIN procurement_order o ON o.id=p.purchase_order_id WHERE r.id=? AND p.status IN('open','closed') AND o.ordered_at IS NOT NULL`;
  const select = `SELECT p.id,p.purchase_order_id,o.purchase_no,p.planned_quantity,p.fulfillment_mode,
    (p.id=r.purchase_order_line_id) is_original,
    (SELECT COUNT(*) FROM procurement_receipt_allocation a WHERE a.purchase_order_line_id=p.id) binding_count`;
  const searchFilter = keyword ? ' AND o.purchase_no LIKE ?' : '';
  const searchParams = keyword ? [receiptLineId, `%${keyword}%`] : [receiptLineId];
  const [rows] = await db.query<ReadRow[]>(
    `${select} ${from}${searchFilter}
      ORDER BY is_original DESC,p.id DESC LIMIT 11`,
    searchParams,
  );
  const requiredIds = query.includeIds ?? [];
  const [requiredRows] = requiredIds.length
    ? await db.query<ReadRow[]>(`${select} ${from} AND p.id IN (${slots(requiredIds)})`, [
        receiptLineId,
        ...requiredIds,
      ])
    : [[] as ReadRow[]];
  const allRows = new Map([...rows, ...requiredRows].map((row) => [text(row.id), row]));
  const candidates = new Map<string, ReceiptAllocationCandidate>();
  for (const row of allRows.values()) {
    const id = text(row.id);
    candidates.set(id, {
      purchaseOrderLineId: id,
      purchaseOrderId: text(row.purchase_order_id),
      purchaseNo: text(row.purchase_no),
      plannedQuantity: text(row.planned_quantity),
      fulfillmentMode: row.fulfillment_mode as ReceiptAllocationCandidate['fulfillmentMode'],
      isOriginal: Number(row.is_original) === 1,
      remainingBindingQuantity:
        row.fulfillment_mode === 'existing_receipt'
          ? Number(row.binding_count) > 0
            ? '0'
            : text(row.planned_quantity)
          : null,
    });
  }
  return {
    items: rows.slice(0, 10).map((row) => candidates.get(text(row.id))!),
    hasMore: rows.length > 10,
    resolved: (query.includeIds ?? []).flatMap((id) =>
      candidates.has(id) ? [candidates.get(id)!] : [],
    ),
  };
}
