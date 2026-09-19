import { randomUUID } from 'node:crypto';
import type { PoolConnection, ResultSetHeader } from 'mysql2/promise';
import type {
  ConfirmSupplierReturnPayload,
  TerminateReceiptScopePayload,
  ProcurementReceiptCommandResult,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { requireOptimisticUpdate } from '../../../common/persistence/optimistic-lock.js';
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

export const terminateReceiptScope = async (
  connection: PoolConnection,
  id: string,
  payload: TerminateReceiptScopePayload,
  context: CommandContext,
): Promise<ProcurementReceiptCommandResult> => {
  const { line, scopes } = await lockReceiptLine(connection, id);
  requireOptimisticUpdate(line.version === payload.version ? 1 : 0);
  const scope = requireScope(scopes, payload.scopeId, payload.scopeVersion);
  requireQuantity(payload.quantity, '终止退回数量');
  if (
    !['uninspected', 'approved'].includes(scope.disposition) ||
    scope.termination_root_scope_id !== null
  )
    return receiptError('只能将未检或已放行的未处置范围指定为采购终止退回', 'RECEIPT_STATE');
  if (payload.quantity > Number(scope.quantity)) return receiptError('终止退回数量超过未处置范围');
  await supersedeScope(connection, scope, context);
  if (payload.quantity < Number(scope.quantity))
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
      disposition: 'termination_return',
      transitionType: 'termination',
    },
    context,
  );
  await connection.execute(
    'UPDATE procurement_receipt_scope SET termination_root_scope_id=?,termination_reason=? WHERE id=?',
    [target, payload.reason.trim(), target],
  );
  await touchReceiptLine(connection, id, context);
  await auditReceipt(
    connection,
    context,
    'receipt.terminate-return',
    String(line.receipt_id),
    { scopeId: scope.id },
    payload,
  );
  return receiptResult(line);
};

export const confirmReceiptReturn = async (
  connection: PoolConnection,
  id: string,
  payload: ConfirmSupplierReturnPayload,
  context: CommandContext,
): Promise<ProcurementReceiptCommandResult> => {
  const { line, scopes } = await lockReceiptLine(connection, id);
  requireOptimisticUpdate(line.version === payload.version ? 1 : 0);
  const scope = requireScope(scopes, payload.scopeId, payload.scopeVersion);
  if (
    !['quality_return', 'termination_return'].includes(scope.disposition) ||
    String(scope.receipt_revision_id) !== payload.receiptRevisionId
  )
    return receiptError('退回范围已变化或尚未明确待退，请刷新', 'RECEIPT_STATE');
  const reasonType = scope.disposition === 'quality_return' ? 'quality' : 'procurement_termination';
  const [result] = await connection.execute<ResultSetHeader>(
    'INSERT INTO procurement_supplier_return(return_no,receipt_line_id,receipt_revision_id,scope_id,inspection_id,reason_type,returned_quantity,returned_at,handover_evidence,remark,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
    [
      `SR-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`,
      id,
      scope.receipt_revision_id,
      scope.id,
      scope.inspection_id,
      reasonType,
      scope.quantity,
      new Date(payload.returnedAt),
      payload.handoverEvidence.trim(),
      payload.remark ?? null,
      context.actorId,
    ],
  );
  await connection.execute(
    "UPDATE procurement_receipt_scope SET disposition='returned',transition_type='return',version=version+1,updated_by=? WHERE id=?",
    [context.actorId, scope.id],
  );
  await touchReceiptLine(connection, id, context);
  await auditReceipt(
    connection,
    context,
    'receipt.return',
    String(line.receipt_id),
    { scopeId: scope.id },
    { ...payload, quantity: scope.quantity, supplierReturnId: String(result.insertId) },
  );
  return receiptResult(line, { supplierReturnId: String(result.insertId) });
};
