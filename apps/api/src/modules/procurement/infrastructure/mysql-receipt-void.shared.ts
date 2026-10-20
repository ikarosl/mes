import type { RowDataPacket } from 'mysql2/promise';
import { type Db, idsSql } from './mysql-purchase-order.shared.js';

/** 非取消补单的原到货来源引用持续有效，不随到货处理轮变化而解除。 */
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
  return [...new Set(references.map((row) => row.purchase_no))];
}
