import { allocateBusinessNumber } from '../../../infrastructure/numbering/mysql-business-number.js';
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  CreatePurchaseOrderPayload,
  PurchaseOrderDraftLine,
  ProcurementDemandCandidate,
  PurchaseOrderLineStatus,
  PurchaseOrderSupplementReason,
  PurchaseFulfillmentMode,
} from '@company/contracts';
import { PROCUREMENT_ERROR_CODES } from '@company/constants';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import { requireOptimisticUpdate } from '../../../common/persistence/optimistic-lock.js';
import type { InventoryMaterialEligibility } from '../../product/public.js';
import {
  type OrderLineRow,
  orderError,
  idsSql,
  hasOrderReceiptFacts,
} from './mysql-purchase-order.shared.js';

export const requireSupplier = async (connection: PoolConnection, id: string) => {
  const [[row]] = await connection.query<RowDataPacket[]>(
    'SELECT id FROM procurement_supplier WHERE id=? AND is_deleted=0 FOR SHARE',
    [id],
  );
  if (!row)
    orderError('供应商不存在或已删除', PROCUREMENT_ERROR_CODES.procurementSourceUnavailable);
};
export const assertSources = (
  lines: PurchaseOrderDraftLine[],
  demands: ProcurementDemandCandidate[],
  workOrderId: string | null,
) => {
  const map = new Map(demands.map((row) => [row.demandId, row]));
  for (const line of lines)
    for (const id of line.demandIds) {
      const demand = map.get(id);
      if (
        !demand ||
        demand.workOrderId !== workOrderId ||
        demand.itemId !== line.itemId ||
        demand.materialVariantId !== line.materialVariantId
      )
        orderError(
          '采购行必须属于所选工单并继承来源需求的物料及精确版本',
          PROCUREMENT_ERROR_CODES.procurementSourceUnavailable,
        );
    }
};
export const insertOrder = async (
  connection: PoolConnection,
  payload: CreatePurchaseOrderPayload,
  context: CommandContext,
  supplement: PurchaseOrderSupplementReason | null = null,
): Promise<string> => {
  const [result] = await connection.execute<ResultSetHeader>(
    'INSERT INTO procurement_order(purchase_no,supplier_id,work_order_id,source_type,supplement_reason,remark,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?)',
    [
      await allocateBusinessNumber(connection, 'purchase_order'),
      payload.supplierId,
      payload.workOrderId,
      payload.sourceType,
      supplement,
      payload.remark ?? null,
      context.actorId,
      context.actorId,
    ],
  );
  return String(result.insertId);
};
export const insertLines = async (
  connection: PoolConnection,
  id: string,
  lines: PurchaseOrderDraftLine[],
  references: InventoryMaterialEligibility[],
  context: CommandContext,
  origins?: Array<{
    lineId: string;
    evidence: string;
    receiptLineId?: string | null;
    fulfillmentMode: PurchaseFulfillmentMode;
  }>,
) => {
  const map = new Map(references.map((row) => [`${row.itemId}:${row.materialVariantId}`, row]));
  for (const [index, line] of lines.entries()) {
    const origin = origins?.[index];
    const ref = map.get(`${line.itemId}:${line.materialVariantId}`);
    if (!ref) return orderError('采购物料资格已变化');
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO procurement_order_line(purchase_order_id,line_no,item_id,material_variant_id,item_code_snapshot,material_variant_code_snapshot,unit_snapshot,planned_quantity,tax_exclusive_amount,tax_inclusive_amount,origin_order_line_id,supplement_evidence,origin_receipt_line_id,fulfillment_mode,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        index + 1,
        line.itemId,
        line.materialVariantId,
        ref.itemCode,
        ref.materialVariantCode,
        ref.unit,
        line.plannedQuantity,
        line.taxExclusiveAmount ?? null,
        line.taxInclusiveAmount ?? null,
        origin?.lineId ?? null,
        origin?.evidence ?? null,
        origin?.receiptLineId ?? null,
        origin?.fulfillmentMode ?? 'new_arrival',
        context.actorId,
        context.actorId,
      ],
    );
    for (const demandId of line.demandIds)
      await connection.execute(
        'INSERT INTO procurement_order_line_source(purchase_order_line_id,demand_id) VALUES(?,?)',
        [result.insertId, demandId],
      );
  }
};
export const deleteDraftLines = async (connection: PoolConnection, lines: OrderLineRow[]) => {
  const ids = lines.map((line) => String(line.id));
  if (!ids.length) return;
  await connection.execute(
    `DELETE FROM procurement_order_line_source WHERE purchase_order_line_id IN (${idsSql(ids)})`,
    ids,
  );
  await connection.execute(`DELETE FROM procurement_order_line WHERE id IN (${idsSql(ids)})`, ids);
};

export const changeOrderLineStatus = async (
  connection: PoolConnection,
  line: OrderLineRow,
  status: Exclude<PurchaseOrderLineStatus, 'draft'>,
  context: CommandContext,
) => {
  const [result] = await connection.execute<ResultSetHeader>(
    'UPDATE procurement_order_line SET status=?,version=version+1,updated_by=? WHERE id=? AND version=?',
    [status, context.actorId, line.id, line.version],
  );
  requireOptimisticUpdate(result.affectedRows);
};
export const refreshOrderCompletion = async (
  connection: PoolConnection,
  orderId: string,
  context: CommandContext,
) => {
  const [lines] = await connection.query<(RowDataPacket & { status: string })[]>(
    'SELECT status FROM procurement_order_line WHERE purchase_order_id=? ORDER BY id FOR SHARE',
    [orderId],
  );
  const status =
    lines.length > 0 && lines.every((line) => line.status === 'closed') ? 'completed' : 'ordered';
  await connection.execute(
    'UPDATE procurement_order SET status=?,version=version+1,updated_by=? WHERE id=?',
    [status, context.actorId, orderId],
  );
  return status;
};
export const auditOrder = (
  connection: PoolConnection,
  context: CommandContext,
  action: string,
  id: string,
  before: unknown,
  after: unknown,
) =>
  writeTransactionalAudit(connection, {
    logType: 'business',
    module: 'procurement',
    action,
    targetType: 'purchase_order',
    targetId: id,
    userId: context.actorId,
    result: 'success',
    beforeData: before,
    afterData: after,
    requestId: context.requestId,
    ip: context.ip,
    userAgent: context.userAgent,
  });

export async function requireOrderWithoutReceiptFacts(
  connection: PoolConnection,
  id: string,
): Promise<void> {
  if (await hasOrderReceiptFacts(connection, id, true))
    return orderError('已有自身到货记录，采购不能取消，可人工结束采购', 'PURCHASE_ORDER_STATE');
}
