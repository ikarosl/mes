import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { MAX_PERSISTED_INTEGER_QUANTITY } from '@company/utils';
import type {
  ReceiptScopeDisposition,
  ReceiptScopeTransition,
  ProcurementReceiptCommandResult,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import { requireOptimisticUpdate } from '../../../common/persistence/optimistic-lock.js';
import { ProcurementDomainError } from '../domain/procurement.errors.js';
import { readOrder } from './mysql-purchase-order.shared.js';

export type ReceiptLineRow = RowDataPacket & {
  id: number;
  receipt_id: number;
  purchase_order_id: number;
  purchase_order_line_id: number;
  line_no: number;
  item_id: number;
  material_variant_id: number;
  supplier_batch_code: string | null;
  current_receipt_revision_id: number;
  batch_id: number | string | null;
  over_receipt_note: string | null;
  version: number;
};
export type ScopeRow = RowDataPacket & {
  id: number;
  receipt_line_id: number;
  receipt_revision_id: number;
  parent_scope_id: number | null;
  quantity: number;
  disposition: ReceiptScopeDisposition;
  transition_type: ReceiptScopeTransition;
  inspection_id: number | null;
  review_case_id: number | null;
  termination_root_scope_id: number | null;
  termination_reason: string | null;
  version: number;
};
export type RevisionRow = RowDataPacket & {
  id: number;
  receipt_line_id: number;
  revision_no: number;
  received_quantity: number;
};
export const receiptError = (
  message: string,
  code: 'INVALID_RECEIPT' | 'RECEIPT_STATE' | 'RECEIPT_NOT_FOUND' = 'INVALID_RECEIPT',
): never => {
  throw new ProcurementDomainError(code, message);
};
export const lockReceiptLine = async (connection: PoolConnection, id: string) => {
  const [[locator]] = await connection.query<(RowDataPacket & { purchase_order_id: number })[]>(
    'SELECT purchase_order_id FROM procurement_receipt_line WHERE id=?',
    [id],
  );
  if (!locator) return receiptError('到货明细不存在', 'RECEIPT_NOT_FOUND');
  const order = await readOrder(connection, String(locator.purchase_order_id), true);
  const [[line]] = await connection.query<ReceiptLineRow[]>(
    'SELECT * FROM procurement_receipt_line WHERE id=? FOR UPDATE',
    [id],
  );
  if (!line) return receiptError('到货明细不存在', 'RECEIPT_NOT_FOUND');
  const scopes = await readScopes(connection, id);
  return { order, line, scopes };
};
export const readScopes = async (connection: PoolConnection, id: string): Promise<ScopeRow[]> => {
  const [rows] = await connection.query<ScopeRow[]>(
    'SELECT * FROM procurement_receipt_scope WHERE receipt_line_id=? ORDER BY id FOR UPDATE',
    [id],
  );
  return rows;
};
export const requireScope = (scopes: ScopeRow[], id: string, version: number): ScopeRow => {
  const scope = scopes.find((row) => String(row.id) === id);
  if (!scope) return receiptError('实物范围不存在', 'RECEIPT_NOT_FOUND');
  requireOptimisticUpdate(scope.version === version ? 1 : 0);
  if (
    scope.disposition === 'superseded' ||
    scope.disposition === 'inbounded' ||
    scope.disposition === 'returned'
  )
    return receiptError('该范围已经处置或被新范围替代，请刷新', 'RECEIPT_STATE');
  return scope;
};
export const requireQuantity = (value: number, label: string, allowZero = false) => {
  if (
    !Number.isSafeInteger(value) ||
    value < (allowZero ? 0 : 1) ||
    value > MAX_PERSISTED_INTEGER_QUANTITY
  )
    receiptError(`${label}必须是${allowZero ? '0' : '1'}～${MAX_PERSISTED_INTEGER_QUANTITY}的整数`);
};
export const requireAggregateQuantity = (values: readonly number[], label: string): number => {
  for (const value of values) requireQuantity(value, label, true);
  const total = values.reduce((sum, value) => sum + BigInt(value), 0n);
  if (total > BigInt(MAX_PERSISTED_INTEGER_QUANTITY))
    return receiptError(
      `${label}超过系统数量存储上限 ${MAX_PERSISTED_INTEGER_QUANTITY}，此限制与采购计划量无关`,
    );
  return Number(total);
};
export const touchReceiptLine = (connection: PoolConnection, id: string, context: CommandContext) =>
  connection.execute(
    'UPDATE procurement_receipt_line SET version=version+1,updated_by=? WHERE id=?',
    [context.actorId, id],
  );
export const supersedeScope = (
  connection: PoolConnection,
  scope: ScopeRow,
  context: CommandContext,
) =>
  connection.execute(
    "UPDATE procurement_receipt_scope SET disposition='superseded',version=version+1,updated_by=? WHERE id=?",
    [context.actorId, scope.id],
  );
export interface NewScope {
  receiptLineId: string;
  receiptRevisionId: string;
  parentScopeId: string | null;
  quantity: number;
  disposition: ReceiptScopeDisposition;
  transitionType: ReceiptScopeTransition;
  inspectionId: string | null;
  reviewCaseId: string | null;
  terminationRootScopeId: string | null;
  terminationReason: string | null;
}
export const inheritScope = (scope: ScopeRow): NewScope => ({
  receiptLineId: String(scope.receipt_line_id),
  receiptRevisionId: String(scope.receipt_revision_id),
  parentScopeId: String(scope.id),
  quantity: Number(scope.quantity),
  disposition: scope.disposition,
  transitionType: 'split',
  inspectionId: scope.inspection_id === null ? null : String(scope.inspection_id),
  reviewCaseId: scope.review_case_id === null ? null : String(scope.review_case_id),
  terminationRootScopeId:
    scope.termination_root_scope_id === null ? null : String(scope.termination_root_scope_id),
  terminationReason: scope.termination_reason,
});
export const insertScope = async (
  connection: PoolConnection,
  scope: NewScope,
  context: CommandContext,
): Promise<string> => {
  requireQuantity(scope.quantity, '范围数量');
  const [result] = await connection.execute<ResultSetHeader>(
    `INSERT INTO procurement_receipt_scope(receipt_line_id,receipt_revision_id,parent_scope_id,quantity,disposition,transition_type,inspection_id,review_case_id,termination_root_scope_id,termination_reason,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      scope.receiptLineId,
      scope.receiptRevisionId,
      scope.parentScopeId,
      scope.quantity,
      scope.disposition,
      scope.transitionType,
      scope.inspectionId,
      scope.reviewCaseId,
      scope.terminationRootScopeId,
      scope.terminationReason,
      context.actorId,
      context.actorId,
    ],
  );
  return String(result.insertId);
};
export const insertRevision = async (
  connection: PoolConnection,
  lineId: string,
  revisionNo: number,
  previousId: string | null,
  quantity: number,
  reason: string,
  context: CommandContext,
): Promise<string> => {
  requireQuantity(quantity, '实收数量', true);
  const [result] = await connection.execute<ResultSetHeader>(
    'INSERT INTO procurement_receipt_revision(receipt_line_id,revision_no,previous_revision_id,received_quantity,reason,physical_identity_confirmed,created_by) VALUES(?,?,?,?,?,1,?)',
    [lineId, revisionNo, previousId, quantity, reason.trim(), context.actorId],
  );
  return String(result.insertId);
};
export const receiptResult = (
  line: Pick<ReceiptLineRow, 'id' | 'receipt_id'>,
  extra: Partial<ProcurementReceiptCommandResult> = {},
): ProcurementReceiptCommandResult => ({
  receiptId: String(line.receipt_id),
  receiptLineId: String(line.id),
  caseIds: [],
  inspectionId: null,
  supplierReturnId: null,
  ...extra,
});
export const auditReceipt = (
  connection: PoolConnection,
  context: CommandContext,
  action: string,
  receiptId: string,
  before: unknown,
  after: unknown,
) =>
  writeTransactionalAudit(connection, {
    logType: 'business',
    module: 'procurement',
    action,
    targetType: 'procurement_receipt',
    targetId: receiptId,
    userId: context.actorId,
    result: 'success',
    beforeData: before,
    afterData: after,
    requestId: context.requestId,
    ip: context.ip,
    userAgent: context.userAgent,
  });
