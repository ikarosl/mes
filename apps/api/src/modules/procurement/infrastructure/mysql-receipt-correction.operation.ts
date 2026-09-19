import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
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
  requireScope,
  requireQuantity,
  requireAggregateQuantity,
  receiptError,
  insertRevision,
  insertScope,
  inheritScope,
  supersedeScope,
  receiptResult,
  auditReceipt,
  type RevisionRow,
  type NewScope,
} from './mysql-receipt.shared.js';

export const correctReceiptLine = async (
  connection: PoolConnection,
  id: string,
  payload: CorrectReceiptLinePayload,
  context: CommandContext,
  quality: QualityInboundCommand,
  inventory: InventoryInboundQuery,
): Promise<ProcurementReceiptCommandResult> => {
  const { line, scopes } = await lockReceiptLine(connection, id);
  requireOptimisticUpdate(line.version === payload.version ? 1 : 0);
  if (String(line.current_receipt_revision_id) !== payload.previousRevisionId)
    return receiptError('实收修订已经变化，请刷新', 'RECEIPT_STATE');
  if (payload.physicalIdentityConfirmed !== true)
    return receiptError('必须核实这是原到货实物的录入更正，不是新来货或损耗');
  requireQuantity(payload.receivedQuantity, '更正后实收', true);
  requireQuantity(payload.newRemainderQuantity, '遗漏剩余实物', true);
  if (new Set(payload.adjustments.map((row) => row.scopeId)).size !== payload.adjustments.length)
    return receiptError('更正范围不能重复');
  const targets = payload.adjustments
    .map((adjustment) => {
      requireQuantity(adjustment.revisedQuantity, '更正范围数量', true);
      return {
        scope: requireScope(scopes, adjustment.scopeId, adjustment.scopeVersion),
        quantity: adjustment.revisedQuantity,
      };
    })
    .filter((target) => target.quantity !== Number(target.scope.quantity));
  if (!targets.length && payload.newRemainderQuantity === 0)
    return receiptError('没有实收数量变化');
  const [[previous]] = await connection.query<RevisionRow[]>(
    'SELECT id,receipt_line_id,revision_no,received_quantity FROM procurement_receipt_revision WHERE id=? AND receipt_line_id=? FOR SHARE',
    [payload.previousRevisionId, id],
  );
  if (!previous) return receiptError('上一版实收不存在', 'RECEIPT_NOT_FOUND');
  const [otherRevisions] = await connection.query<
    (RowDataPacket & { received_quantity: number })[]
  >(
    'SELECT r.received_quantity FROM procurement_receipt_line l JOIN procurement_receipt_revision r ON r.id=l.current_receipt_revision_id WHERE l.purchase_order_line_id=? AND l.id<>? ORDER BY l.id FOR SHARE',
    [line.purchase_order_line_id, id],
  );
  requireAggregateQuantity(
    [...otherRevisions.map((row) => Number(row.received_quantity)), payload.receivedQuantity],
    '更正后采购行累计实收',
  );
  const leaves = scopes.filter((scope) => scope.disposition !== 'superseded');
  const oldTotal = leaves.reduce((sum, scope) => sum + Number(scope.quantity), 0);
  if (oldTotal !== Number(previous.received_quantity))
    return receiptError('当前范围总量与实收事实不一致', 'RECEIPT_STATE');
  const changed = new Set(targets.map((target) => String(target.scope.id)));
  const nextTotal =
    leaves
      .filter((scope) => !changed.has(String(scope.id)))
      .reduce((sum, scope) => sum + Number(scope.quantity), 0) +
    targets.reduce((sum, target) => sum + target.quantity, 0) +
    payload.newRemainderQuantity;
  if (nextTotal !== payload.receivedQuantity)
    return receiptError('实收总量必须等于未影响范围、调整后范围与新核实余量之和');
  const revisionId = await insertRevision(
    connection,
    id,
    previous.revision_no + 1,
    payload.previousRevisionId,
    payload.receivedQuantity,
    payload.reason,
    context,
  );
  const oldReviewIds = targets
    .filter((target) => target.scope.disposition === 'reviewing')
    .map((target) => String(target.scope.review_case_id));
  if (oldReviewIds.length)
    await quality.supersedeCases(
      { caseIds: oldReviewIds, receiptLineId: id, receiptRevisionId: revisionId },
      context,
    );
  const caseIds: string[] = [];
  for (const target of targets) {
    await supersedeScope(connection, target.scope, context);
    const next: NewScope = {
      ...inheritScope(target.scope),
      receiptRevisionId: revisionId,
      quantity: target.quantity,
      disposition: 'reviewing',
      transitionType: 'receipt_correction',
      inspectionId: null,
      reviewCaseId: null,
    };
    const targetId = target.quantity > 0 ? await insertScope(connection, next, context) : null;
    const review = await quality.startCase(
      {
        receiptLineId: id,
        receiptRevisionId: revisionId,
        sourceScopeId: String(target.scope.id),
        targetScopeId: targetId,
        caseType: 'receipt_correction',
        coveredQuantity: target.quantity,
        reason: payload.reason,
      },
      context,
    );
    if (targetId)
      await connection.execute('UPDATE procurement_receipt_scope SET review_case_id=? WHERE id=?', [
        review.id,
        targetId,
      ]);
    caseIds.push(review.id);
  }
  if (payload.newRemainderQuantity > 0) {
    const targetId = await insertScope(
      connection,
      {
        receiptLineId: id,
        receiptRevisionId: revisionId,
        parentScopeId: null,
        quantity: payload.newRemainderQuantity,
        disposition: 'reviewing',
        transitionType: 'receipt_correction',
        inspectionId: null,
        reviewCaseId: null,
        terminationRootScopeId: null,
        terminationReason: null,
      },
      context,
    );
    const review = await quality.startCase(
      {
        receiptLineId: id,
        receiptRevisionId: revisionId,
        sourceScopeId: null,
        targetScopeId: targetId,
        caseType: 'receipt_correction',
        coveredQuantity: payload.newRemainderQuantity,
        reason: payload.reason,
      },
      context,
    );
    await connection.execute('UPDATE procurement_receipt_scope SET review_case_id=? WHERE id=?', [
      review.id,
      targetId,
    ]);
    caseIds.push(review.id);
  }
  // Quality 锁在 Inventory 之前；任何事实核对失败会连同新修订、范围和复核一起回滚。
  const [facts] = await inventory.getReceiptInboundFacts({ receiptLineIds: [id] });
  const [returns] = await connection.query<(RowDataPacket & { returned_quantity: number })[]>(
    'SELECT returned_quantity FROM procurement_supplier_return WHERE receipt_line_id=? ORDER BY id FOR SHARE',
    [id],
  );
  const inbound = Number(facts?.inboundQuantity ?? 0);
  const returned = returns.reduce((sum, row) => sum + Number(row.returned_quantity), 0);
  if (
    inbound !==
      leaves
        .filter((scope) => scope.disposition === 'inbounded')
        .reduce((sum, scope) => sum + Number(scope.quantity), 0) ||
    returned !==
      leaves
        .filter((scope) => scope.disposition === 'returned')
        .reduce((sum, scope) => sum + Number(scope.quantity), 0)
  )
    return receiptError('已处置范围与实际入库／退回事实不一致', 'RECEIPT_STATE');
  if (payload.receivedQuantity < inbound + returned)
    return receiptError('更正实收不能少于已实际入库及退回量');
  await connection.execute(
    'UPDATE procurement_receipt_line SET current_receipt_revision_id=?,version=version+1,updated_by=? WHERE id=?',
    [revisionId, context.actorId, id],
  );
  await auditReceipt(
    connection,
    context,
    'receipt.correct',
    String(line.receipt_id),
    {
      previousRevisionId: payload.previousRevisionId,
      receivedQuantity: Number(previous.received_quantity),
    },
    payload,
  );
  return receiptResult(line, { caseIds });
};
