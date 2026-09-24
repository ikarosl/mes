import type { PoolConnection } from 'mysql2/promise';
import type {
  CorrectReceiptLinePayload,
  ProcurementReceiptCommandResult,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { requireOptimisticUpdate } from '../../../common/persistence/optimistic-lock.js';
import type { QualityInboundCommand } from '../../quality/public.js';
import type { InventoryInboundQuery } from '../../inventory/public.js';
import {
  lockReceiptLine,
  requireQuantity,
  receiptError,
  insertRevision,
  receiptResult,
  auditReceipt,
} from './mysql-receipt.shared.js';
import {
  lockRound,
  receiptBalance,
  replaceRound,
  assertReceiptAggregate,
} from './mysql-receipt-round.shared.js';

export async function correctReceiptLine(
  db: PoolConnection,
  id: string,
  payload: CorrectReceiptLinePayload,
  context: CommandContext,
  quality: QualityInboundCommand,
  inventory: InventoryInboundQuery,
): Promise<ProcurementReceiptCommandResult> {
  const { line, allocations } = await lockReceiptLine(db, id, inventory);
  requireOptimisticUpdate(line.version === payload.version ? 1 : 0);
  const round = await lockRound(db, line, payload);
  if (String(line.current_receipt_revision_id) !== payload.previousRevisionId)
    return receiptError('实收修订已经变化，请刷新', 'RECEIPT_STATE');
  if (payload.physicalIdentityConfirmed !== true)
    return receiptError('必须核实这是原到货实物的录入更正，不是新来货或损耗');
  requireQuantity(payload.receivedQuantity, '更正后本次到货核实总量', true);
  const balance = await receiptBalance(db, line, allocations);
  if (payload.receivedQuantity === Number(balance.revision.received_quantity))
    return receiptError('没有实收数量变化');
  if (payload.receivedQuantity < balance.inbound + balance.returned)
    return receiptError('更正实收不能少于已实际入库及退回量');
  await assertReceiptAggregate(db, line, payload.receivedQuantity);
  const revisionId = await insertRevision(
    db,
    id,
    balance.revision.revision_no + 1,
    payload.previousRevisionId,
    payload.receivedQuantity,
    payload.reason,
    context,
  );
  const remaining = payload.receivedQuantity - balance.inbound - balance.returned;
  const next = await replaceRound(
    db,
    line,
    round,
    {
      revisionId,
      quantity: remaining,
      trigger: 'receipt_correction',
      status: remaining === 0 ? 'finalized' : 'uninspected',
      reason: payload.reason,
    },
    context,
    quality,
  );
  await db.execute(
    'UPDATE procurement_receipt_line SET current_receipt_revision_id=?,version=version+1,updated_by=? WHERE id=?',
    [revisionId, context.actorId, id],
  );
  await auditReceipt(
    db,
    context,
    'receipt.correct',
    String(line.receipt_id),
    {
      roundId: String(round.id),
      previousRevisionId: payload.previousRevisionId,
      receivedQuantity: Number(balance.revision.received_quantity),
    },
    { ...payload, roundId: String(next.id) },
  );
  return receiptResult(line, { roundId: String(next.id) });
}
