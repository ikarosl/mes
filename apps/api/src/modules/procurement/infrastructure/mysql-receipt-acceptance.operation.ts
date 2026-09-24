import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  ConfirmReceiptAcceptancePayload,
  ProcurementReceiptCommandResult,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { requireOptimisticUpdate } from '../../../common/persistence/optimistic-lock.js';
import type { InventoryInboundQuery } from '../../inventory/public.js';
import type { QualityInboundQuery } from '../../quality/public.js';
import { allocateReceiptQuantities } from '../domain/receipt-allocation.policy.js';
import { sortedIds } from './mysql-purchase-order.shared.js';
import {
  lockReceiptLine,
  lockReceiptRoots,
  receiptError,
  insertRevision,
  insertAllocation,
  receiptResult,
  auditReceipt,
  requireAggregateQuantity,
} from './mysql-receipt.shared.js';
import {
  lockRound,
  receiptBalance,
  precedingAllocations,
  requireNotRejected,
  replaceRound,
  assertReceiptAggregate,
} from './mysql-receipt-round.shared.js';
import { requireAllocationOwnership } from './mysql-receipt-allocation-ownership.js';

export async function confirmReceiptAcceptance(
  db: PoolConnection,
  id: string,
  payload: ConfirmReceiptAcceptancePayload,
  context: CommandContext,
  quality: QualityInboundQuery,
  inventory: InventoryInboundQuery,
): Promise<ProcurementReceiptCommandResult> {
  const targetIds = sortedIds(
    payload.details.flatMap((d) => (d.purchaseOrderLineId ? [d.purchaseOrderLineId] : [])),
  );
  const extraRoots: string[] = [];
  if (targetIds.length) {
    const [targets] = await db.query<(RowDataPacket & { purchase_order_id: number })[]>(
      `SELECT purchase_order_id FROM procurement_order_line WHERE id IN (${targetIds.map(() => '?').join(',')})`,
      targetIds,
    );
    extraRoots.push(...targets.map((t) => String(t.purchase_order_id)));
  }
  // Include new supplemental roots before taking any receipt lock.
  await lockReceiptRoots(db, [id], extraRoots);
  const { line, allocations: priorAllocations } = await lockReceiptLine(db, id, inventory);
  requireOptimisticUpdate(line.version === payload.version ? 1 : 0);
  let round = await lockRound(db, line, payload);
  const sources = precedingAllocations(round, priorAllocations);
  requireNotRejected(round);
  if (
    !['awaiting_acceptance', 'finalized'].includes(round.status) ||
    String(line.current_receipt_revision_id) !== payload.receiptRevisionId ||
    !payload.physicalIdentityConfirmed
  )
    return receiptError('本轮尚不允许定稿，或实收版本已变化，请刷新', 'RECEIPT_STATE');
  const review = await quality.getCase(payload.caseId);
  const inspection = review?.inspection;
  if (
    !review ||
    review.status !== 'completed' ||
    review.receiptLineId !== id ||
    !inspection ||
    inspection.id !== payload.inspectionId ||
    String(round.inspection_id) !== inspection.id ||
    inspection.releaseDecision !== 'released'
  )
    return receiptError(
      '必须引用本轮有效且明确放行的质检记录；待复检或不放行不能定为可入',
      'RECEIPT_STATE',
    );
  const allocations = allocateReceiptQuantities(payload.details, payload.confirmedQuantity);
  const confirmedQuantity = payload.confirmedQuantity;
  const inboundQuantity = allocations
    .filter((a) => a.disposition === 'inbound')
    .reduce((sum, a) => sum + a.quantity, 0);
  const qualified = Number(inspection.qualifiedQuantity);
  const unqualified = Number(inspection.unqualifiedQuantity);
  const sampled = qualified + unqualified;
  const consumed = priorAllocations
    .filter((row) => String(row.inspection_id) === inspection.id)
    .reduce((sum, row) => sum + row.inbound_quantity + row.returned_quantity, 0);
  const suggestion =
    inspection.inspectionMethod === 'full'
      ? Math.max(0, qualified - consumed)
      : sampled <= confirmedQuantity && unqualified <= confirmedQuantity
        ? confirmedQuantity - unqualified
        : null;
  const overrideReason = payload.overrideReason?.trim() || null;
  if ((suggestion === null || inboundQuantity > suggestion) && !overrideReason)
    return receiptError('可入数量超过质检建议或样本与核实数量不一致，请填写数量异常核对依据');
  if (overrideReason && overrideReason.length > 2000)
    return receiptError('数量异常核对依据最多 2000 字');
  const remark = payload.remark.trim();
  if (!remark || remark.length > 2000) return receiptError('请填写核对说明，最多 2000 字');
  const balance = await receiptBalance(db, line, priorAllocations);
  if (round.status === 'finalized' && balance.remaining === 0)
    return receiptError('本批已无未处置实物，不能恢复已入库或已退回数量', 'RECEIPT_STATE');
  await requireAllocationOwnership(db, line, sources, allocations, confirmedQuantity);
  const nextTotal = requireAggregateQuantity(
    [balance.inbound, balance.returned, confirmedQuantity],
    '核对后本次到货核实总量',
  );
  await assertReceiptAggregate(db, line, nextTotal);
  let afterRevisionId = payload.receiptRevisionId;
  if (nextTotal !== Number(balance.revision.received_quantity))
    afterRevisionId = await insertRevision(
      db,
      id,
      balance.revision.revision_no + 1,
      payload.receiptRevisionId,
      nextTotal,
      remark,
      context,
    );
  if (round.status === 'finalized') {
    round = await replaceRound(
      db,
      line,
      round,
      {
        revisionId: payload.receiptRevisionId,
        quantity: balance.remaining,
        trigger: 'acceptance_correction',
        status: 'awaiting_acceptance',
        inspectionId: inspection.id,
        reason: remark,
      },
      context,
    );
  }
  const [[previous]] = await db.query<(RowDataPacket & { id: number })[]>(
    'SELECT id FROM procurement_receipt_acceptance WHERE receipt_line_id=? ORDER BY id DESC LIMIT 1',
    [id],
  );
  const [created] = await db.execute<ResultSetHeader>(
    `INSERT INTO procurement_receipt_acceptance(receipt_line_id,inspection_record_id,round_id,before_receipt_revision_id,
      after_receipt_revision_id,confirmed_scope_quantity,previous_acceptance_id,remark,override_reason,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)`,
    [
      id,
      inspection.id,
      round.id,
      payload.receiptRevisionId,
      afterRevisionId,
      confirmedQuantity,
      previous?.id ?? null,
      remark,
      overrideReason,
      context.actorId,
    ],
  );
  for (const [index, allocation] of allocations.entries()) {
    await insertAllocation(
      db,
      {
        receiptLineId: id,
        roundId: String(round.id),
        acceptanceId: String(created.insertId),
        lineNo: index + 1,
        ...allocation,
        terminationReason: allocation.returnReason === 'procurement_termination' ? remark : null,
      },
      context,
    );
  }
  await db.execute(
    "UPDATE procurement_receipt_round SET status='finalized',version=version+1,updated_by=? WHERE id=?",
    [context.actorId, round.id],
  );
  await db.execute(
    'UPDATE procurement_receipt_line SET current_receipt_revision_id=?,version=version+1,updated_by=? WHERE id=?',
    [afterRevisionId, context.actorId, id],
  );
  await auditReceipt(
    db,
    context,
    'receipt.accept',
    String(line.receipt_id),
    { roundId: payload.roundId, receiptRevisionId: payload.receiptRevisionId },
    {
      acceptanceId: String(created.insertId),
      roundId: String(round.id),
      inspectionId: inspection.id,
      confirmedQuantity,
      suggestedQuantity: suggestion,
      inboundQuantity,
      overrideReason,
      afterRevisionId,
      details: allocations,
    },
  );
  return receiptResult(line, {
    roundId: String(round.id),
    acceptanceId: String(created.insertId),
    inspectionId: inspection.id,
    caseIds: [review.id],
  });
}
