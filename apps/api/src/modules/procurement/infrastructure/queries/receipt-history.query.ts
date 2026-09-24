import { allocationSelect } from './receipt-allocation.query.js';
import { readReceiptAcceptances } from './receipt-acceptance.query.js';
import type {
  PageQuery,
  PageResult,
  ReceiptHistoryItem,
  ReceiptHistoryKind,
} from '@company/contracts';
import type { QualityInboundQuery } from '../../../quality/public.js';
import type { Db } from '../mysql-purchase-order.shared.js';
import {
  type ReadRow,
  INBOUND_FACT_COLUMNS,
  inboundFactSelect,
  mapInbound,
  mapRevision,
  mapRound,
  mapAllocation,
  mapReturn,
  pageInput,
} from './receipt-read.shared.js';

export async function readReceiptHistory(
  db: Db,
  quality: QualityInboundQuery,
  id: string,
  kind: ReceiptHistoryKind,
  query: PageQuery,
): Promise<PageResult<ReceiptHistoryItem>> {
  const { page, pageSize } = pageInput(query);
  if (kind === 'acceptances') return readReceiptAcceptances(db, id, query);
  if (kind === 'cases') return quality.listCases({ receiptLineIds: [id], page, pageSize });
  if (kind === 'inbounds') {
    const select = (columns: string) =>
      `${inboundFactSelect(columns)} AND detail.procurement_receipt_line_id=?`;
    const [[count]] = await db.query<ReadRow[]>(`${select('COUNT(*) total')}`, [id]);
    const [rows] = await db.query<ReadRow[]>(
      `${select(INBOUND_FACT_COLUMNS)} ORDER BY detail.id DESC LIMIT ? OFFSET ?`,
      [id, pageSize, (page - 1) * pageSize],
    );
    return { items: rows.map(mapInbound), total: Number(count?.total ?? 0), page, pageSize };
  }
  const choices = {
    rounds: { table: 'procurement_receipt_round', map: mapRound },
    revisions: { table: 'procurement_receipt_revision', map: mapRevision },
    allocations: { table: 'procurement_receipt_allocation', map: mapAllocation },
    returns: { table: 'procurement_supplier_return', map: mapReturn },
  };
  const choice = choices[kind];
  const [[count]] = await db.query<ReadRow[]>(
    `SELECT COUNT(*) total FROM ${choice.table} WHERE receipt_line_id=?`,
    [id],
  );
  const [rows] = await db.query<ReadRow[]>(
    kind === 'allocations'
      ? `${allocationSelect()} WHERE a.receipt_line_id=? ORDER BY a.id DESC LIMIT ? OFFSET ?`
      : `SELECT * FROM ${choice.table} WHERE receipt_line_id=? ORDER BY id DESC LIMIT ? OFFSET ?`,
    [id, pageSize, (page - 1) * pageSize],
  );
  return {
    items: rows.map((row) => choice.map(row)),
    total: Number(count?.total ?? 0),
    page,
    pageSize,
  };
}
