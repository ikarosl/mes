import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  ConfirmReceiptAcceptancePayload,
  ProcurementReceiptCommandResult,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { requireOptimisticUpdate } from '../../../common/persistence/optimistic-lock.js';
import type { InventoryInboundQuery } from '../../inventory/public.js';
import type { QualityInboundQuery } from '../../quality/public.js';
import {
  requireReceiptAcceptanceState,
  requireReceiptAcceptanceInspection,
  evaluateReceiptAcceptanceQuantities,
  requireReceiptAcceptanceRemaining,
} from '../domain/receipt-acceptance.policy.js';
import { requireReceiptNotRejected } from '../domain/receipt-round.policy.js';
import { sortedIds } from './mysql-purchase-order.shared.js';
import {
  lockReceiptLine,
  lockReceiptRoots,
  insertRevision,
  insertAllocation,
  receiptResult,
  auditReceipt,
} from './mysql-receipt.shared.js';
import { requireAggregateQuantity } from '../domain/receipt-quantity.policy.js';
import {
  lockRound,
  receiptBalance,
  precedingAllocations,
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
  requireReceiptNotRejected(round.trigger_type);
  const transition = requireReceiptAcceptanceState({
    status: round.status,
    currentRevisionId: String(line.current_receipt_revision_id),
    receiptRevisionId: payload.receiptRevisionId,
    physicalIdentityConfirmed: payload.physicalIdentityConfirmed,
  });
  const { caseId, inspection } = requireReceiptAcceptanceInspection(
    await quality.getCase(payload.caseId),
    {
      receiptLineId: id,
      inspectionId: payload.inspectionId,
      roundInspectionId: round.inspection_id === null ? null : String(round.inspection_id),
    },
  );
  const { allocations, confirmedQuantity, inboundQuantity, suggestion, overrideReason, remark } =
    evaluateReceiptAcceptanceQuantities(
      payload,
      inspection,
      priorAllocations.map((row) => ({
        inspectionId: row.inspection_id === null ? null : String(row.inspection_id),
        inboundQuantity: row.inbound_quantity,
        returnedQuantity: row.returned_quantity,
        returnReason: row.return_reason,
      })),
    );
  const balance = await receiptBalance(db, line, priorAllocations);
  requireReceiptAcceptanceRemaining(round.status, balance.remaining);
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
  if (transition.replaceRound) {
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
    caseIds: [caseId],
  });
}
