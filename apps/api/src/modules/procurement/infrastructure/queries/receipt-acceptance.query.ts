import type { PageQuery, PageResult, ReceiptAcceptanceItem } from '@company/contracts';
import type { Db } from '../mysql-purchase-order.shared.js';
import { type ReadRow, text, nullableText, date, slots, pageInput } from './receipt-read.shared.js';

export async function mapReceiptAcceptances(
  db: Db,
  headers: ReadRow[],
): Promise<ReceiptAcceptanceItem[]> {
  if (!headers.length) return [];
  const [details] = await db.query<ReadRow[]>(
    `SELECT d.* FROM procurement_receipt_allocation d
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
