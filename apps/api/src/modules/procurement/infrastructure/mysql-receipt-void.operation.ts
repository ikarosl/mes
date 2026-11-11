import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type {
  VoidProcurementReceiptPayload,
  VoidProcurementReceiptCommandResult,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { requireOptimisticUpdate } from '../../../common/persistence/optimistic-lock.js';
import type { InventoryInboundQuery } from '../../inventory/public.js';
import { receiptError } from '../domain/procurement.errors.js';
import {
  receiptVoidBlockedReason,
  receiptVoidVersionsMatch,
} from '../domain/receipt-void.policy.js';
import { sortedIds } from './mysql-purchase-order.shared.js';
import {
  lockReceiptRoots,
  lockReceiptLines,
  touchReceiptLine,
  auditReceipt,
} from './mysql-receipt.shared.js';
import { readReceiptDependentPurchases } from './mysql-receipt-void.shared.js';

export async function voidProcurementReceipt(
  db: PoolConnection,
  id: string,
  payload: VoidProcurementReceiptPayload,
  context: CommandContext,
  inventory: InventoryInboundQuery,
): Promise<VoidProcurementReceiptCommandResult> {
  const [[locator]] = await db.query<(RowDataPacket & { purchase_order_id: number })[]>(
    'SELECT purchase_order_id FROM procurement_receipt WHERE id=?',
    [id],
  );
  if (!locator) return receiptError('到货登记不存在', 'RECEIPT_NOT_FOUND');
  const [locators] = await db.query<(RowDataPacket & { id: number })[]>(
    'SELECT id FROM procurement_receipt_line WHERE receipt_id=? ORDER BY id',
    [id],
  );
  const ids = locators.map((row) => String(row.id));
  await lockReceiptRoots(db, ids, [String(locator.purchase_order_id)]);
  const [[receipt]] = await db.query<(RowDataPacket & { is_voided: number; version: number })[]>(
    'SELECT is_voided,version FROM procurement_receipt WHERE id=? FOR UPDATE',
    [id],
  );
  if (!receipt) return receiptError('到货登记不存在', 'RECEIPT_NOT_FOUND');
  requireOptimisticUpdate(receipt.version === payload.version ? 1 : 0);
  if (Number(receipt.is_voided) === 1) return receiptError('到货登记已作废', 'RECEIPT_STATE');
  const lines = await lockReceiptLines(db, ids);
  requireOptimisticUpdate(
    receiptVoidVersionsMatch(
      payload.lines,
      lines.map((line) => ({ receiptLineId: String(line.id), version: line.version })),
    )
      ? 1
      : 0,
  );
  const facts = await inventory.getReceiptInboundFacts({ receiptLineIds: sortedIds(ids) });
  const blocked = receiptVoidBlockedReason({
    isVoided: false,
    hasExecution: facts.some((row) => BigInt(row.inboundQuantity) > 0n),
    dependentPurchaseNos: await readReceiptDependentPurchases(db, ids, true),
  });
  if (blocked) return receiptError(blocked, 'RECEIPT_STATE');
  const [updated] = await db.execute<import('mysql2/promise').ResultSetHeader>(
    'UPDATE procurement_receipt SET is_voided=1,void_reason=?,voided_by=?,voided_at=CURRENT_TIMESTAMP,updated_by=?,version=version+1 WHERE id=? AND version=?',
    [payload.reason, context.actorId, context.actorId, id, payload.version],
  );
  requireOptimisticUpdate(updated.affectedRows);
  for (const line of lines) await touchReceiptLine(db, String(line.id), line.version, context);
  await auditReceipt(
    db,
    context,
    'receipt.void',
    id,
    { version: payload.version, void: null },
    { version: payload.version + 1, reason: payload.reason, lines: payload.lines },
  );
  return { receiptId: id, version: payload.version + 1 };
}
