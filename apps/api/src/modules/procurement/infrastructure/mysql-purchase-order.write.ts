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
  sortedIds,
} from './mysql-purchase-order.shared.js';

export const requireSupplier = async (connection: PoolConnection, id: string) => {
  const [[row]] = await connection.query<RowDataPacket[]>(
    'SELECT id FROM procurement_supplier WHERE id=? AND is_deleted=0 FOR SHARE',
    [id],
  );
  if (!row)
    orderError('供应商不存在或已删除', PROCUREMENT_ERROR_CODES.procurementSourceUnavailable);
};
export const requireSuppliers = async (connection: PoolConnection, ids: string[]) => {
  for (const id of sortedIds(ids)) await requireSupplier(connection, id);
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
    'INSERT INTO procurement_order(purchase_no,work_order_id,source_type,supplement_reason,remark,created_by,updated_by) VALUES(?,?,?,?,?,?,?)',
    [
      `PO-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`,
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
  origin?: {
    lineId: string;
    evidence: string;
    receiptLineId?: string | null;
    allocationId?: string | null;
  },
) => {
  const map = new Map(references.map((row) => [`${row.itemId}:${row.materialVariantId}`, row]));
  for (const [index, line] of lines.entries()) {
    const ref = map.get(`${line.itemId}:${line.materialVariantId}`);
    if (!ref) return orderError('采购物料资格已变化');
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO procurement_order_line(purchase_order_id,line_no,supplier_id,item_id,material_variant_id,item_code_snapshot,material_variant_code_snapshot,unit_snapshot,planned_quantity,origin_order_line_id,supplement_evidence,origin_receipt_line_id,origin_allocation_id,fulfillment_mode,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        index + 1,
        line.supplierId,
        line.itemId,
        line.materialVariantId,
        ref.itemCode,
        ref.materialVariantCode,
        ref.unit,
        line.plannedQuantity,
        origin?.lineId ?? null,
        origin?.evidence ?? null,
        origin?.receiptLineId ?? null,
        origin?.allocationId ?? null,
        origin?.receiptLineId && !origin?.allocationId ? 'existing_receipt' : 'new_arrival',
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
    `INSERT INTO procurement_order_line_closure(purchase_order_line_id,reason_type,reason,planned_quantity,received_quantity,undetermined_quantity,approved_quantity,inbound_quantity,return_due_quantity,returned_quantity,quality_returned_quantity,evidence_json,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
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
    'UPDATE procurement_order_line SET status=?,version=version+1,updated_by=? WHERE id=?',
    [reasonType === 'cancelled' ? 'cancelled' : 'closed', context.actorId, line.id],
  );
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
  const status = lines.every((line) => line.status === 'cancelled')
    ? 'cancelled'
    : lines.every((line) => line.status === 'closed' || line.status === 'cancelled')
      ? 'completed'
      : 'ordered';
  await connection.execute(
    'UPDATE procurement_order SET status=?,version=version+1,updated_by=? WHERE id=?',
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
  reason: PurchaseOrderSupplementReason,
  receiptLineId?: string,
  allocationId?: string,
) => {
  if (!receiptLineId) return orderError('补单必须关联真实到货明细');
  if (reason === 'quality_replacement' && !allocationId)
    return orderError('质量补发必须引用已确认的质量退回分配明细');
  if (reason !== 'quality_replacement' && allocationId)
    return orderError('只有质量补发可以引用质量退回分配明细');
  const [[receipt]] = await connection.query<RowDataPacket[]>(
    'SELECT id FROM procurement_receipt_line WHERE id=? AND purchase_order_line_id=? FOR SHARE',
    [receiptLineId, lineId],
  );
  if (!receipt) return orderError('原到货不属于所选原采购行');
  if (!allocationId) return;
  const [[allocation]] = await connection.query<RowDataPacket[]>(
    `SELECT id FROM procurement_receipt_allocation
     WHERE id=? AND receipt_line_id=? AND disposition='return' AND return_reason='quality' FOR SHARE`,
    [allocationId, receiptLineId],
  );
  if (!allocation) return orderError('补发依据必须是同次到货的正式质量退回处置');
  // 原采购根已锁定，与复检、清单更正和实际退回串行；历史明细本身不能证明当前仍可补发。
  const [[current]] = await connection.query<RowDataPacket[]>(
    `SELECT a.id FROM procurement_receipt_allocation a
      JOIN procurement_receipt_line l ON l.id=a.receipt_line_id JOIN procurement_receipt_round r ON r.id=a.round_id
      WHERE a.id=? AND ((l.current_round_id=a.round_id AND r.status='finalized')
        OR EXISTS(SELECT 1 FROM procurement_supplier_return sr WHERE sr.allocation_id=a.id AND sr.reason_type='quality')) FOR SHARE`,
    [allocationId],
  );
  if (!current) return orderError('质量处置已被更正或正在复核，请依据当前正式清单重新办理补发');
};

export async function requireOrderWithoutReceiptFacts(
  connection: PoolConnection,
  id: string,
): Promise<void> {
  const [[arrival]] = await connection.query<RowDataPacket[]>(
    'SELECT id FROM procurement_receipt_line WHERE purchase_order_id=? ORDER BY id LIMIT 1 FOR SHARE',
    [id],
  );
  const [[allocation]] = await connection.query<RowDataPacket[]>(
    'SELECT a.id FROM procurement_receipt_allocation a JOIN procurement_order_line l ON l.id=a.purchase_order_line_id WHERE l.purchase_order_id=? LIMIT 1 FOR SHARE',
    [id],
  );
  if (arrival || allocation)
    return orderError('已有确认到货，采购不能取消，请逐行人工结束', 'PURCHASE_ORDER_STATE');
}
