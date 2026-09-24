import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type {
  StartReceiptReviewPayload,
  InspectReceiptLinePayload,
  ProcurementReceiptCommandResult,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { requireOptimisticUpdate } from '../../../common/persistence/optimistic-lock.js';
import type { InventoryInboundQuery } from '../../inventory/public.js';
import type { QualityInboundCommand, QualityInboundQuery } from '../../quality/public.js';
import {
  lockReceiptLine,
  receiptError,
  touchReceiptLine,
  receiptResult,
  auditReceipt,
} from './mysql-receipt.shared.js';
import {
  lockRound,
  receiptBalance,
  replaceRound,
  requireNotRejected,
} from './mysql-receipt-round.shared.js';

export async function startReceiptReview(
  db: PoolConnection,
  id: string,
  payload: StartReceiptReviewPayload,
  context: CommandContext,
  quality: QualityInboundCommand,
  inventory: InventoryInboundQuery,
): Promise<ProcurementReceiptCommandResult> {
  const { line, allocations } = await lockReceiptLine(db, id, inventory);
  requireOptimisticUpdate(line.version === payload.version ? 1 : 0);
  let round = await lockRound(db, line, payload);
  requireNotRejected(round);
  const { remaining } = await receiptBalance(db, line, allocations);
  if (round.status === 'reviewing' || remaining <= 0)
    return receiptError('本批正在检查或已无未处置实物', 'RECEIPT_STATE');
  if (payload.caseType === 'initial' && round.status !== 'uninspected')
    return receiptError('已有检验结论，请使用复检或检验更正');
  if (round.status !== 'uninspected') {
    round = await replaceRound(
      db,
      line,
      round,
      {
        quantity: remaining,
        trigger: 'review',
        status: 'reviewing',
        reason: payload.reason,
      },
      context,
      quality,
    );
  } else {
    await db.execute(
      "UPDATE procurement_receipt_round SET status='reviewing',version=version+1,updated_by=? WHERE id=?",
      [context.actorId, round.id],
    );
  }
  const review = await quality.startCase(
    {
      receiptLineId: id,
      receiptRevisionId: String(line.current_receipt_revision_id),
      roundId: String(round.id),
      caseType: payload.caseType,
      coveredQuantity: remaining,
      reason: payload.reason,
    },
    context,
  );
  await touchReceiptLine(db, id, context);
  await auditReceipt(
    db,
    context,
    'receipt.review',
    String(line.receipt_id),
    { roundId: payload.roundId },
    { ...payload, roundId: String(round.id), declaredQuantity: remaining },
  );
  return receiptResult(line, { roundId: String(round.id), caseIds: [review.id] });
}

export async function inspectReceiptLine(
  db: PoolConnection,
  id: string,
  payload: InspectReceiptLinePayload,
  context: CommandContext,
  quality: QualityInboundCommand,
  query: QualityInboundQuery,
  inventory: InventoryInboundQuery,
): Promise<ProcurementReceiptCommandResult> {
  const { line } = await lockReceiptLine(db, id, inventory);
  requireOptimisticUpdate(line.version === payload.version ? 1 : 0);
  const round = await lockRound(db, line, payload);
  if (round.status !== 'reviewing')
    return receiptError('本轮已结束、拒收或被替代，请刷新', 'RECEIPT_STATE');
  const review = await query.getCase(payload.caseId);
  if (
    !review ||
    review.status !== 'reviewing' ||
    review.receiptLineId !== id ||
    review.roundId !== String(round.id) ||
    review.receiptRevisionId !== payload.receiptRevisionId ||
    String(line.current_receipt_revision_id) !== payload.receiptRevisionId
  )
    return receiptError('检验办理与当前轮次或实收修订不匹配', 'RECEIPT_STATE');
  const [[previous]] = await db.query<(RowDataPacket & { inspection_id: number | null })[]>(
    'SELECT inspection_id FROM procurement_receipt_round WHERE receipt_line_id=? AND round_no<? AND inspection_id IS NOT NULL ORDER BY round_no DESC LIMIT 1',
    [id, round.round_no],
  );
  const inspection = await quality.completeCase(
    {
      ...payload,
      caseId: review.id,
      version: payload.caseVersion,
      receiptLineId: id,
      receiptRevisionId: review.receiptRevisionId,
      roundId: String(round.id),
      previousRecordId: previous?.inspection_id ? String(previous.inspection_id) : null,
    },
    context,
  );
  const status =
    inspection.releaseDecision === 'released'
      ? 'awaiting_acceptance'
      : inspection.releaseDecision === 'pending_reinspection'
        ? 'reinspection_required'
        : 'quality_rejected';
  await db.execute(
    'UPDATE procurement_receipt_round SET status=?,inspection_id=?,version=version+1,updated_by=? WHERE id=?',
    [status, inspection.id, context.actorId, round.id],
  );
  await touchReceiptLine(db, id, context);
  await auditReceipt(
    db,
    context,
    'receipt.inspect',
    String(line.receipt_id),
    { caseId: review.id },
    { inspectionId: inspection.id, roundId: String(round.id), status },
  );
  return receiptResult(line, {
    roundId: String(round.id),
    caseIds: [review.id],
    inspectionId: inspection.id,
  });
}
