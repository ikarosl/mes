import type { RowDataPacket } from 'mysql2/promise';
import { type Db, idsSql } from './mysql-purchase-order.shared.js';

/** 引用与正式承接均为依赖；失效轮次不解除已绑定补单的归属。 */
export async function readReceiptDependentPurchases(
  db: Db,
  receiptLineIds: string[],
  lock = false,
): Promise<string[]> {
  if (!receiptLineIds.length) return [];
  const marks = idsSql(receiptLineIds);
  type DependentPurchase = RowDataPacket & { id: number; purchase_no: string };
  const [references] = await db.query<DependentPurchase[]>(
    `SELECT orders.id,orders.purchase_no
      FROM procurement_order_line candidate
      JOIN procurement_order orders ON orders.id=candidate.purchase_order_id
      WHERE orders.status<>'cancelled' AND candidate.origin_receipt_line_id IN (${marks})
      ORDER BY orders.id,candidate.id${lock ? ' FOR SHARE' : ''}`,
    receiptLineIds,
  );
  // 锁内读直接连接承接事实，避免依赖子查询仍使用作废请求开始时的旧快照。
  const [ownerships] = await db.query<DependentPurchase[]>(
    `SELECT orders.id,orders.purchase_no
      FROM procurement_receipt_allocation allocation
      JOIN procurement_receipt_line origin ON origin.id=allocation.receipt_line_id
      JOIN procurement_order_line candidate ON candidate.id=allocation.purchase_order_line_id
      JOIN procurement_order orders ON orders.id=candidate.purchase_order_id
      WHERE orders.status<>'cancelled' AND allocation.receipt_line_id IN (${marks})
        AND candidate.id<>origin.purchase_order_line_id
      ORDER BY orders.id,candidate.id,allocation.id${lock ? ' FOR SHARE' : ''}`,
    receiptLineIds,
  );
  return [...new Set([...references, ...ownerships].map((row) => row.purchase_no))];
}
