import type {
  PageQuery,
  PageResult,
  ReceiptHistoryKind,
  ReceiptHistoryItem,
} from '@company/contracts';
import type { Db } from '../mysql-purchase-order.shared.js';
import {
  inboundFactSelect,
  INBOUND_FACT_COLUMNS,
  mapInbound,
  pageInput,
  type ReadRow,
} from './receipt-read.shared.js';
import {
  RECEIPT_HANDLING_COLUMNS,
  mapReceiptHandling,
  type ReceiptHandlingRow,
} from '../mysql-receipt-handling.shared.js';
export async function readReceiptHistory(
  db: Db,
  id: string,
  kind: ReceiptHistoryKind,
  query: PageQuery,
): Promise<PageResult<ReceiptHistoryItem>> {
  const page = pageInput(query);
  if (kind === 'inbounds') {
    const [[count]] = await db.query<ReadRow[]>(
      `${inboundFactSelect('COUNT(*) total')} AND detail.procurement_receipt_line_id=?`,
      [id],
    );
    const [rows] = await db.query<ReadRow[]>(
      `${inboundFactSelect(INBOUND_FACT_COLUMNS)} AND detail.procurement_receipt_line_id=? ORDER BY inbound.inbound_at DESC,detail.id DESC LIMIT ? OFFSET ?`,
      [id, page.pageSize, (page.page - 1) * page.pageSize],
    );
    return { items: rows.map(mapInbound), total: Number(count?.total ?? 0), ...page };
  }
  const [[count]] = await db.query<ReadRow[]>(
    'SELECT COUNT(*) total FROM procurement_receipt_handling WHERE receipt_line_id=?',
    [id],
  );
  const [rows] = await db.query<ReceiptHandlingRow[]>(
    `SELECT ${RECEIPT_HANDLING_COLUMNS} FROM procurement_receipt_handling WHERE receipt_line_id=? ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`,
    [id, page.pageSize, (page.page - 1) * page.pageSize],
  );
  return {
    items: rows.map(mapReceiptHandling),
    total: Number(count?.total ?? 0),
    ...page,
  };
}
