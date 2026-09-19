import type { PoolConnection } from 'mysql2/promise';
import type {
  StartReceiptReviewPayload,
  InspectReceiptLinePayload,
  ProcurementReceiptCommandResult,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { requireOptimisticUpdate } from '../../../common/persistence/optimistic-lock.js';
import type { QualityInboundCommand, QualityInboundQuery } from '../../quality/public.js';
import {
  lockReceiptLine,
  requireScope,
  requireQuantity,
  receiptError,
  supersedeScope,
  inheritScope,
  insertScope,
  touchReceiptLine,
  receiptResult,
  auditReceipt,
} from './mysql-receipt.shared.js';

export const startReceiptReview = async (
  connection: PoolConnection,
  id: string,
  payload: StartReceiptReviewPayload,
  context: CommandContext,
  quality: QualityInboundCommand,
): Promise<ProcurementReceiptCommandResult> => {
  const { line, scopes } = await lockReceiptLine(connection, id);
  requireOptimisticUpdate(line.version === payload.version ? 1 : 0);
  const scope = requireScope(scopes, payload.scopeId, payload.scopeVersion);
  requireQuantity(payload.quantity, '复核数量');
  if (
    scope.disposition === 'reviewing' ||
    scope.termination_root_scope_id !== null ||
    !['uninspected', 'approved', 'quality_return'].includes(scope.disposition)
  )
    return receiptError('该范围正在复核或已经指定采购终止退回，不能再次发起', 'RECEIPT_STATE');
  if (payload.quantity > Number(scope.quantity)) return receiptError('复核数量超过当前未处置范围');
  if (payload.caseType === 'initial' && scope.disposition !== 'uninspected')
    return receiptError('已有检验结论的范围请使用复检或检验更正');
  await supersedeScope(connection, scope, context);
  if (Number(scope.quantity) > payload.quantity)
    await insertScope(
      connection,
      { ...inheritScope(scope), quantity: Number(scope.quantity) - payload.quantity },
      context,
    );
  const target = await insertScope(
    connection,
    {
      ...inheritScope(scope),
      quantity: payload.quantity,
      disposition: 'reviewing',
      transitionType: 'review',
      inspectionId: null,
      reviewCaseId: null,
    },
    context,
  );
  const review = await quality.startCase(
    {
      receiptLineId: id,
      receiptRevisionId: String(scope.receipt_revision_id),
      sourceScopeId: String(scope.id),
      targetScopeId: target,
      caseType: payload.caseType,
      coveredQuantity: payload.quantity,
      reason: payload.reason,
    },
    context,
  );
  await connection.execute('UPDATE procurement_receipt_scope SET review_case_id=? WHERE id=?', [
    review.id,
    target,
  ]);
  await touchReceiptLine(connection, id, context);
  await auditReceipt(
    connection,
    context,
    'receipt.review',
    String(line.receipt_id),
    { scopeId: payload.scopeId },
    payload,
  );
  return receiptResult(line, { caseIds: [review.id] });
};

export const inspectReceiptLine = async (
  connection: PoolConnection,
  id: string,
  payload: InspectReceiptLinePayload,
  context: CommandContext,
  quality: QualityInboundCommand,
  query: QualityInboundQuery,
): Promise<ProcurementReceiptCommandResult> => {
  const { line, scopes } = await lockReceiptLine(connection, id);
  requireOptimisticUpdate(line.version === payload.version ? 1 : 0);
  const review = await query.getCase(payload.caseId);
  if (
    !review ||
    review.receiptLineId !== id ||
    review.receiptRevisionId !== payload.receiptRevisionId
  )
    return receiptError('检验办理与当前到货明细或修订不匹配');
  const scope =
    review.targetScopeId === null
      ? null
      : scopes.find((row) => String(row.id) === review.targetScopeId);
  if (
    review.targetScopeId !== null &&
    (!scope || scope.disposition !== 'reviewing' || String(scope.review_case_id) !== review.id)
  )
    return receiptError('检验范围已经被更正或处置，请刷新', 'RECEIPT_STATE');
  if (!scope && (review.caseType !== 'receipt_correction' || Number(review.coveredQuantity) !== 0))
    return receiptError('检验办理缺少实物范围');
  const inspection = await quality.completeCase(
    {
      ...payload,
      caseId: review.id,
      version: payload.caseVersion,
      receiptLineId: id,
      receiptRevisionId: review.receiptRevisionId,
      targetScopeId: review.targetScopeId,
    },
    context,
  );
  if (scope) {
    await supersedeScope(connection, scope, context);
    if (scope.termination_root_scope_id !== null) {
      await insertScope(
        connection,
        {
          ...inheritScope(scope),
          disposition: 'termination_return',
          transitionType: 'inspection',
          inspectionId: inspection.id,
          reviewCaseId: review.id,
        },
        context,
      );
    } else {
      const results = [
        ['approved', Number(inspection.approvedQuantity)],
        ['quality_return', Number(inspection.qualityReturnQuantity)],
        ['uninspected', Number(inspection.undeterminedQuantity)],
      ] as const;
      for (const [disposition, quantity] of results)
        if (quantity > 0)
          await insertScope(
            connection,
            {
              ...inheritScope(scope),
              quantity,
              disposition,
              transitionType: 'inspection',
              inspectionId: inspection.id,
              reviewCaseId: review.id,
            },
            context,
          );
    }
  }
  await touchReceiptLine(connection, id, context);
  await auditReceipt(
    connection,
    context,
    'receipt.inspect',
    String(line.receipt_id),
    { caseId: review.id },
    { inspectionId: inspection.id },
  );
  return receiptResult(line, { caseIds: [review.id], inspectionId: inspection.id });
};
