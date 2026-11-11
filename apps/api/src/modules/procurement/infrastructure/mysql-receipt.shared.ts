import type { PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import { requireOptimisticUpdate } from '../../../common/persistence/optimistic-lock.js';
import { receiptError } from '../domain/procurement.errors.js';
import { readOrder, sortedIds, idsSql } from './mysql-purchase-order.shared.js';

export const RECEIPT_LINE_COLUMNS =
  'id,receipt_id,purchase_order_id,purchase_order_line_id,item_id,material_variant_id,supplier_batch_code,version';
export type ReceiptLineRow = RowDataPacket & {
  id: number;
  receipt_id: number;
  purchase_order_id: number;
  purchase_order_line_id: number;
  item_id: number;
  material_variant_id: number;
  supplier_batch_code: string | null;
  version: number;
};
/** Originals and dependent supplements share the source root lock before arrival locks. */
export async function lockReceiptRoots(
  db: PoolConnection,
  ids: string[],
  extraRoots: string[] = [],
) {
  const roots = [...extraRoots];
  for (const id of sortedIds(ids)) {
    const [rows] = await db.query<(RowDataPacket & { purchase_order_id: number })[]>(
      'SELECT purchase_order_id FROM procurement_receipt_line WHERE id=? UNION SELECT purchase_order_id FROM procurement_order_line WHERE origin_receipt_line_id=?',
      [id, id],
    );
    roots.push(...rows.map((row) => String(row.purchase_order_id)));
  }
  const result = sortedIds(roots);
  for (const id of result) await readOrder(db, id, true);
  return result;
}
export async function lockReceiptLines(
  db: PoolConnection,
  ids: string[],
): Promise<ReceiptLineRow[]> {
  const ordered = sortedIds(ids);
  if (!ordered.length) return receiptError('请选择到货物料');
  const [locators] = await db.query<ReceiptLineRow[]>(
    `SELECT ${RECEIPT_LINE_COLUMNS} FROM procurement_receipt_line WHERE id IN (${idsSql(ordered)}) ORDER BY id`,
    ordered,
  );
  if (locators.length !== ordered.length)
    return receiptError('到货明细不存在', 'RECEIPT_NOT_FOUND');
  await lockReceiptRoots(db, ordered);
  for (const receiptId of sortedIds(locators.map((row) => String(row.receipt_id)))) {
    await db.query('SELECT id FROM procurement_receipt WHERE id=? FOR UPDATE', [receiptId]);
    await requireReceiptActive(db, receiptId);
  }
  const result: ReceiptLineRow[] = [];
  for (const id of ordered) {
    const [[row]] = await db.query<ReceiptLineRow[]>(
      `SELECT ${RECEIPT_LINE_COLUMNS} FROM procurement_receipt_line WHERE id=? FOR UPDATE`,
      [id],
    );
    if (!row) return receiptError('到货明细不存在', 'RECEIPT_NOT_FOUND');
    result.push(row);
  }
  return result;
}
export async function requireReceiptActive(db: PoolConnection, receiptId: string): Promise<void> {
  const [[row]] = await db.query<(RowDataPacket & { is_voided: number })[]>(
    'SELECT is_voided FROM procurement_receipt WHERE id=? FOR SHARE',
    [receiptId],
  );
  if (!row) return receiptError('到货登记不存在', 'RECEIPT_NOT_FOUND');
  if (Number(row.is_voided) === 1)
    return receiptError('到货登记已作废，不能继续办理', 'RECEIPT_STATE');
}
export async function touchReceiptLine(
  db: PoolConnection,
  id: string,
  version: number,
  context: CommandContext,
): Promise<void> {
  const [updated] = await db.execute<ResultSetHeader>(
    'UPDATE procurement_receipt_line SET version=version+1,updated_by=? WHERE id=? AND version=?',
    [context.actorId, id, version],
  );
  requireOptimisticUpdate(updated.affectedRows);
}
export const auditReceipt = (
  db: PoolConnection,
  context: CommandContext,
  action: string,
  receiptId: string,
  before: unknown,
  after: unknown,
) =>
  writeTransactionalAudit(db, {
    logType: 'business',
    module: 'procurement',
    action,
    targetType: 'procurement_receipt',
    targetId: receiptId,
    userId: context.actorId,
    result: 'success',
    beforeData: before,
    afterData: after,
    requestId: context.requestId,
    ip: context.ip,
    userAgent: context.userAgent,
  });
