import { randomUUID } from 'node:crypto';
import type { PoolConnection, ResultSetHeader } from 'mysql2/promise';
import type {
  ConfirmSupplierReturnPayload,
  RejectReceiptLinePayload,
  RevokeReceiptRejectionPayload,
  ProcurementReceiptCommandResult,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { requireOptimisticUpdate } from '../../../common/persistence/optimistic-lock.js';
import type { InventoryInboundQuery } from '../../inventory/public.js';
import type { QualityInboundCommand } from '../../quality/public.js';
import {
  lockReceiptLine,
  requireAllocation,
  receiptError,
  touchReceiptLine,
  receiptResult,
  auditReceipt,
} from './mysql-receipt.shared.js';
import {
  lockRound,
  receiptBalance,
  precedingAllocations,
  replaceRound,
  requireNotRejected,
} from './mysql-receipt-round.shared.js';
import { createRejectionAllocations } from './mysql-receipt-rejection.shared.js';

export async function rejectReceiptLine(
  db: PoolConnection,
  id: string,
  payload: RejectReceiptLinePayload,
  context: CommandContext,
  quality: QualityInboundCommand,
  inventory: InventoryInboundQuery,
): Promise<ProcurementReceiptCommandResult> {
  const { line, allocations } = await lockReceiptLine(db, id, inventory);
  requireOptimisticUpdate(line.version === payload.version ? 1 : 0);
  const round = await lockRound(db, line, payload);
  const sources = precedingAllocations(round, allocations);
  requireNotRejected(round);
  const { remaining } = await receiptBalance(db, line, allocations);
  if (remaining <= 0) return receiptError('本批已无尚未处置实物', 'RECEIPT_STATE');
  if (!payload.reason.trim()) return receiptError('请填写整批拒收原因');
  const next = await replaceRound(
    db,
    line,
    round,
    {
      quantity: remaining,
      trigger: 'manual_rejection',
      status: 'finalized',
      reason: payload.reason,
    },
    context,
    quality,
  );
  await createRejectionAllocations(
    db,
    line,
    next,
    sources,
    remaining,
    payload.reason,
    context,
    payload.ownership,
  );
  await touchReceiptLine(db, id, context);
  await auditReceipt(
    db,
    context,
    'receipt.reject',
    String(line.receipt_id),
    { roundId: String(round.id) },
    { ...payload, roundId: String(next.id), quantity: remaining },
  );
  return receiptResult(line, { roundId: String(next.id) });
}

export async function revokeReceiptRejection(
  db: PoolConnection,
  id: string,
  payload: RevokeReceiptRejectionPayload,
  context: CommandContext,
  quality: QualityInboundCommand,
  inventory: InventoryInboundQuery,
): Promise<ProcurementReceiptCommandResult> {
  const { line, allocations } = await lockReceiptLine(db, id, inventory);
  requireOptimisticUpdate(line.version === payload.version ? 1 : 0);
  const round = await lockRound(db, line, payload);
  const { remaining } = await receiptBalance(db, line, allocations);
  if (round.trigger_type !== 'manual_rejection' || round.status !== 'finalized' || remaining <= 0)
    return receiptError('只有当前人工拒收且仍有未处置实物，才能撤销拒收', 'RECEIPT_STATE');
  if (!payload.reason.trim()) return receiptError('请填写撤销拒收原因');
  const next = await replaceRound(
    db,
    line,
    round,
    {
      quantity: remaining,
      trigger: 'rejection_revocation',
      status: 'uninspected',
      reason: payload.reason,
    },
    context,
    quality,
  );
  await touchReceiptLine(db, id, context);
  await auditReceipt(
    db,
    context,
    'receipt.revoke-rejection',
    String(line.receipt_id),
    { roundId: String(round.id) },
    { ...payload, roundId: String(next.id) },
  );
  return receiptResult(line, { roundId: String(next.id) });
}

export async function confirmReceiptReturn(
  db: PoolConnection,
  id: string,
  payload: ConfirmSupplierReturnPayload,
  context: CommandContext,
  inventory: InventoryInboundQuery,
): Promise<ProcurementReceiptCommandResult> {
  const { line, allocations } = await lockReceiptLine(db, id, inventory);
  requireOptimisticUpdate(line.version === payload.version ? 1 : 0);
  const round = await lockRound(db, line, payload);
  const row = requireAllocation(allocations, payload.allocationId, String(round.id));
  if (
    row.disposition !== 'return' ||
    String(row.receipt_revision_id) !== payload.receiptRevisionId ||
    (row.return_reason === 'manual_rejection'
      ? round.trigger_type !== 'manual_rejection' || row.acceptance_id !== null
      : row.acceptance_id === null || row.inspection_id === null)
  )
    return receiptError('当前分配不具备实际退回依据', 'RECEIPT_STATE');
  const [created] = await db.execute<ResultSetHeader>(
    `INSERT INTO procurement_supplier_return(return_no,receipt_line_id,receipt_revision_id,allocation_id,inspection_id,reason_type,returned_quantity,returned_at,handover_evidence,remark,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    [
      `SR-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`,
      id,
      row.receipt_revision_id,
      row.id,
      row.inspection_id,
      row.return_reason,
      row.remaining_quantity,
      new Date(payload.returnedAt),
      payload.handoverEvidence.trim(),
      payload.remark ?? null,
      context.actorId,
    ],
  );
  await touchReceiptLine(db, id, context);
  await auditReceipt(
    db,
    context,
    'receipt.return',
    String(line.receipt_id),
    { allocationId: String(row.id) },
    { ...payload, quantity: row.remaining_quantity, supplierReturnId: String(created.insertId) },
  );
  return receiptResult(line, {
    roundId: String(round.id),
    supplierReturnId: String(created.insertId),
  });
}
