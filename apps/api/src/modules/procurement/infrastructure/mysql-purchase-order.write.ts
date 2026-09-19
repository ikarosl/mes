import { emptyClosureFacts } from './mysql-purchase-order-closure.facts.js';
import { randomUUID } from 'node:crypto';
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  CreatePurchaseOrderPayload,
  PurchaseOrderDraftLine,
  ProcurementDemandCandidate,
  PurchaseOrderClosureReason,
  PurchaseOrderSupplementReason,
} from '@company/contracts';
import { PROCUREMENT_ERROR_CODES } from '@company/constants';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import type { InventoryMaterialEligibility } from '../../product/public.js';
import {
  type OrderRow,
  type OrderLineRow,
  orderError,
  idsSql,
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
) => {
  const map = new Map(demands.map((row) => [row.demandId, row]));
  for (const line of lines)
    for (const id of line.demandIds) {
      const demand = map.get(id);
      if (
        !demand ||
        demand.itemId !== line.itemId ||
        demand.materialVariantId !== line.materialVariantId
      )
        orderError(
          '采购行必须继承来源需求的物料及精确版本',
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
    'INSERT INTO purchase_order(purchase_no,supplier_id,source_type,supplement_reason,remark,created_by,updated_by) VALUES(?,?,?,?,?,?,?)',
    [
      `PO-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`,
      payload.supplierId,
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
  origin?: {
    lineId: string;
    evidence: string;
    receiptLineId?: string | null;
    supplierReturnId?: string | null;
  },
) => {
  const map = new Map(references.map((row) => [`${row.itemId}:${row.materialVariantId}`, row]));
  for (const [index, line] of lines.entries()) {
    const ref = map.get(`${line.itemId}:${line.materialVariantId}`);
    if (!ref) return orderError('采购物料资格已变化');
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO purchase_order_line(purchase_order_id,line_no,item_id,material_variant_id,item_code_snapshot,material_variant_code_snapshot,unit_snapshot,planned_quantity,origin_order_line_id,supplement_evidence,origin_receipt_line_id,origin_supplier_return_id,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        index + 1,
        line.itemId,
        line.materialVariantId,
        ref.itemCode,
        ref.materialVariantCode,
        ref.unit,
        line.plannedQuantity,
        origin?.lineId ?? null,
        origin?.evidence ?? null,
        origin?.receiptLineId ?? null,
        origin?.supplierReturnId ?? null,
        context.actorId,
        context.actorId,
      ],
    );
    for (const demandId of line.demandIds)
      await connection.execute(
        'INSERT INTO purchase_order_line_source(purchase_order_line_id,demand_id) VALUES(?,?)',
        [result.insertId, demandId],
      );
  }
};
export const deleteDraftLines = async (connection: PoolConnection, lines: OrderLineRow[]) => {
  const ids = lines.map((line) => String(line.id));
  if (!ids.length) return;
  await connection.execute(
    `DELETE FROM purchase_order_line_source WHERE purchase_order_line_id IN (${idsSql(ids)})`,
    ids,
  );
  await connection.execute(`DELETE FROM purchase_order_line WHERE id IN (${idsSql(ids)})`, ids);
};

export const closeOrderLine = async (
  connection: PoolConnection,
  order: OrderRow,
  line: OrderLineRow,
  reasonType: PurchaseOrderClosureReason,
  reason: string,
  context: CommandContext,
  facts = emptyClosureFacts(),
) => {
  await connection.execute(
    `INSERT INTO purchase_order_line_closure(purchase_order_line_id,reason_type,reason,planned_quantity,received_quantity,undetermined_quantity,approved_quantity,inbound_quantity,return_due_quantity,returned_quantity,quality_returned_quantity,evidence_json,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      line.id,
      reasonType,
      reason,
      line.planned_quantity,
      Number(facts.quantities.receivedQuantity),
      Number(facts.quantities.undeterminedQuantity),
      Number(facts.quantities.approvedQuantity),
      Number(facts.quantities.inboundQuantity),
      Number(facts.quantities.returnDueQuantity),
      Number(facts.quantities.returnedQuantity),
      Number(facts.quantities.qualityReturnedQuantity),
      JSON.stringify({
        purchaseOrderId: String(order.id),
        purchaseOrderVersion: order.version,
        lineVersion: line.version,
        ...facts.evidence,
        hasOpenReview: facts.quantities.hasOpenReview,
      }),
      context.actorId,
    ],
  );
  await connection.execute(
    'UPDATE purchase_order_line SET status=?,version=version+1,updated_by=? WHERE id=?',
    [reasonType === 'cancelled' ? 'cancelled' : 'closed', context.actorId, line.id],
  );
};
export const refreshOrderCompletion = async (
  connection: PoolConnection,
  orderId: string,
  context: CommandContext,
) => {
  const [lines] = await connection.query<(RowDataPacket & { status: string })[]>(
    'SELECT status FROM purchase_order_line WHERE purchase_order_id=? ORDER BY id FOR SHARE',
    [orderId],
  );
  const status = lines.every((line) => line.status === 'cancelled')
    ? 'cancelled'
    : lines.every((line) => line.status === 'closed' || line.status === 'cancelled')
      ? 'completed'
      : 'ordered';
  await connection.execute(
    'UPDATE purchase_order SET status=?,version=version+1,updated_by=? WHERE id=?',
    [status, context.actorId, orderId],
  );
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

export const requireSupplementEvidence = async (
  connection: PoolConnection,
  lineId: string,
  reason: string,
  receiptLineId?: string,
  returnId?: string,
) => {
  if (reason === 'quality_replacement' && (!receiptLineId || !returnId))
    return orderError('质量补货必须追溯原到货及真实质量退回记录');
  if (returnId && (!receiptLineId || reason !== 'quality_replacement'))
    return orderError('只有质量补货可以关联供应商质量退回');
  if (receiptLineId) {
    const [[receipt]] = await connection.query<RowDataPacket[]>(
      'SELECT id FROM procurement_receipt_line WHERE id=? AND purchase_order_line_id=? FOR SHARE',
      [receiptLineId, lineId],
    );
    if (!receipt) return orderError('原到货不属于所选原采购行');
  }
  if (returnId) {
    const [[returned]] = await connection.query<RowDataPacket[]>(
      "SELECT id FROM procurement_supplier_return WHERE id=? AND receipt_line_id=? AND reason_type='quality' FOR SHARE",
      [returnId, receiptLineId],
    );
    if (!returned) return orderError('质量补货只能依据已确认的质量退回，采购终止退回不适用');
  }
};
