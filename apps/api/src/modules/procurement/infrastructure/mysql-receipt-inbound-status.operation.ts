import type { PoolConnection, ResultSetHeader } from 'mysql2/promise';
import type {
  ReceiptInboundStatusResult,
  SetReceiptInboundStatusPayload,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { requireOptimisticUpdate } from '../../../common/persistence/optimistic-lock.js';
import { auditReceipt, lockReceiptLines } from './mysql-receipt.shared.js';
import { receiptError } from '../domain/procurement.errors.js';

export async function setReceiptInboundStatus(
  db: PoolConnection,
  id: string,
  payload: SetReceiptInboundStatusPayload,
  context: CommandContext,
): Promise<ReceiptInboundStatusResult> {
  // 人工开关不依赖到货作废、采购、检验或数量；沿用来源锁序与入库互斥。
  const [line] = await lockReceiptLines(db, [id], { requireActive: false });
  if (!line) return receiptError('到货明细不存在', 'RECEIPT_NOT_FOUND');
  requireOptimisticUpdate(line.version === payload.version ? 1 : 0);
  const before = {
    receiptLineId: id,
    inboundClosed: Number(line.inbound_closed) === 1,
    version: Number(line.version),
  };
  if (before.inboundClosed === payload.inboundClosed) return before;
  const [updated] = await db.execute<ResultSetHeader>(
    'UPDATE procurement_receipt_line SET inbound_closed=?,version=version+1,updated_by=? WHERE id=? AND version=?',
    [payload.inboundClosed ? 1 : 0, context.actorId, id, payload.version],
  );
  requireOptimisticUpdate(updated.affectedRows);
  const after = {
    receiptLineId: id,
    inboundClosed: payload.inboundClosed,
    version: before.version + 1,
  };
  await auditReceipt(db, context, 'receipt.inbound-status', String(line.receipt_id), before, after);
  return after;
}
