import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { MAX_PERSISTED_INTEGER_QUANTITY } from '@company/utils';
import type {
  ReceiptAllocationDisposition,
  ReceiptReturnReason,
  ProcurementReceiptCommandResult,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import { ProcurementDomainError } from '../domain/procurement.errors.js';
import type { InventoryInboundQuery } from '../../inventory/public.js';
import { readOrder, sortedIds } from './mysql-purchase-order.shared.js';

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
  current_round_id: number | null;
  batch_id: number | string | null;
  over_receipt_note: string | null;
  version: number;
};
export type AllocationRow = RowDataPacket & {
  id: number;
  receipt_line_id: number;
  round_id: number;
  round_status: string;
  acceptance_id: number | null;
  purchase_order_line_id: number | null;
  receipt_revision_id: number;
  inspection_id: number | null;
  quantity: number;
  disposition: ReceiptAllocationDisposition;
  return_reason: ReceiptReturnReason | null;
  termination_reason: string | null;
  remark: string | null;
  inbound_quantity: number;
  returned_quantity: number;
  remaining_quantity: number;
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
export const lockReceiptRoots = async (
  connection: PoolConnection,
  ids: string[],
  extraRoots: string[] = [],
) => {
  const roots = [...extraRoots];
  for (const id of sortedIds(ids)) {
    const [rows] = await connection.query<(RowDataPacket & { purchase_order_id: number })[]>(
      `SELECT purchase_order_id FROM procurement_receipt_line WHERE id=?
       UNION SELECT p.purchase_order_id FROM procurement_receipt_allocation a
       JOIN procurement_order_line p ON p.id=a.purchase_order_line_id WHERE a.receipt_line_id=?`,
      [id, id],
    );
    roots.push(...rows.map((row) => String(row.purchase_order_id)));
  }
  for (const root of sortedIds(roots)) await readOrder(connection, root, true);
};
export const lockReceiptLine = async (
  connection: PoolConnection,
  id: string,
  inventory: InventoryInboundQuery,
) => {
  await lockReceiptRoots(connection, [id]);
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
  const allocations = await readAllocations(connection, id, inventory);
  return { order, line, allocations };
};
export const readAllocations = async (
  connection: PoolConnection,
  id: string,
  inventory: InventoryInboundQuery,
): Promise<AllocationRow[]> => {
  const [rows] = await connection.query<AllocationRow[]>(
    `SELECT a.*,r.status round_status,COALESCE(h.after_receipt_revision_id,r.receipt_revision_id) receipt_revision_id,
      h.inspection_record_id inspection_id FROM procurement_receipt_allocation a
      JOIN procurement_receipt_round r ON r.id=a.round_id
      LEFT JOIN procurement_receipt_acceptance h ON h.id=a.acceptance_id
      WHERE a.receipt_line_id=? ORDER BY a.id FOR SHARE`,
    [id],
  );
  const [facts] = await inventory.getReceiptInboundFacts({ receiptLineIds: [id] });
  const [returns] = await connection.query<
    (RowDataPacket & { allocation_id: number; returned_quantity: number })[]
  >(
    'SELECT allocation_id,returned_quantity FROM procurement_supplier_return WHERE receipt_line_id=? FOR SHARE',
    [id],
  );
  const inbound = new Map<string, number>();
  for (const fact of facts?.receipts ?? [])
    inbound.set(fact.allocationId, (inbound.get(fact.allocationId) ?? 0) + Number(fact.quantity));
  const returned = new Map(
    returns.map((row) => [String(row.allocation_id), Number(row.returned_quantity)]),
  );
  const known = new Set(rows.map((row) => String(row.id)));
  if ([...inbound.keys(), ...returned.keys()].some((key) => !known.has(key)))
    receiptError('实际入退缺少对应的处置分配', 'RECEIPT_STATE');
  for (const row of rows) {
    row.inbound_quantity = inbound.get(String(row.id)) ?? 0;
    row.returned_quantity = returned.get(String(row.id)) ?? 0;
    row.remaining_quantity = Number(row.quantity) - row.inbound_quantity - row.returned_quantity;
    requireQuantity(row.remaining_quantity, '分配未执行量', true);
    if (
      (row.inbound_quantity > 0 && row.disposition !== 'inbound') ||
      (row.returned_quantity > 0 && row.disposition !== 'return')
    )
      receiptError('实际执行与分配去向不一致', 'RECEIPT_STATE');
  }
  return rows;
};
export const requireAllocation = (
  allocations: AllocationRow[],
  id: string,
  roundId: string,
): AllocationRow => {
  const row = allocations.find((row) => String(row.id) === id);
  if (!row) return receiptError('处置分配不存在', 'RECEIPT_NOT_FOUND');
  if (
    String(row.round_id) !== roundId ||
    row.round_status !== 'finalized' ||
    row.remaining_quantity <= 0
  )
    return receiptError('分配已经执行或所属轮次失效，请刷新', 'RECEIPT_STATE');
  return row;
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
export const insertAllocation = async (
  db: PoolConnection,
  row: {
    receiptLineId: string;
    roundId: string;
    acceptanceId: string | null;
    lineNo: number;
    purchaseOrderLineId: string | null;
    disposition: ReceiptAllocationDisposition;
    quantity: number;
    returnReason: ReceiptReturnReason | null;
    terminationReason?: string | null;
    remark?: string | null;
  },
  context: CommandContext,
): Promise<string> => {
  requireQuantity(row.quantity, '分配数量');
  const [created] = await db.execute<ResultSetHeader>(
    `INSERT INTO procurement_receipt_allocation(receipt_line_id,round_id,acceptance_id,line_no,purchase_order_line_id,disposition,quantity,return_reason,termination_reason,remark,created_by)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    [
      row.receiptLineId,
      row.roundId,
      row.acceptanceId,
      row.lineNo,
      row.purchaseOrderLineId,
      row.disposition,
      row.quantity,
      row.returnReason,
      row.terminationReason ?? null,
      row.remark ?? null,
      context.actorId,
    ],
  );
  return String(created.insertId);
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
  roundId: null,
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
