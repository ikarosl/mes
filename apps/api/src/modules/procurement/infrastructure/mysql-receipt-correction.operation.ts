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
  insertRevision,
  receiptResult,
  auditReceipt,
} from './mysql-receipt.shared.js';
import {
  requireReceiptCorrectionInput,
  planReceiptCorrection,
} from '../domain/receipt-round.policy.js';
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
  requireReceiptCorrectionInput({
    currentRevisionId: String(line.current_receipt_revision_id),
    previousRevisionId: payload.previousRevisionId,
    physicalIdentityConfirmed: payload.physicalIdentityConfirmed,
    receivedQuantity: payload.receivedQuantity,
  });
  const balance = await receiptBalance(db, line, allocations);
  const transition = planReceiptCorrection(
    payload.receivedQuantity,
    Number(balance.revision.received_quantity),
    balance,
  );
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
  const next = await replaceRound(
    db,
    line,
    round,
    {
      revisionId,
      quantity: transition.remaining,
      trigger: 'receipt_correction',
      status: transition.status,
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
