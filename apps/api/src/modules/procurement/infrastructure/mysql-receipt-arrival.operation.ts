import { randomUUID } from 'node:crypto';
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  ConfirmProcurementReceiptPayload,
  ProcurementReceiptCommandResult,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { requireOptimisticUpdate } from '../../../common/persistence/optimistic-lock.js';
import type { ProductInventoryEligibility } from '../../product/public.js';
import { readOrder, readLines, sortedIds } from './mysql-purchase-order.shared.js';
import { requireSuppliers } from './mysql-purchase-order.write.js';
import {
  receiptError,
  requireQuantity,
  requireAggregateQuantity,
  insertRevision,
  auditReceipt,
} from './mysql-receipt.shared.js';

import { insertRound } from './mysql-receipt-round.shared.js';

export const confirmReceiptArrival = async (
  connection: PoolConnection,
  payload: ConfirmProcurementReceiptPayload,
  context: CommandContext,
  product: ProductInventoryEligibility,
): Promise<ProcurementReceiptCommandResult> => {
  const order = await readOrder(connection, payload.purchaseOrderId, true);
  requireOptimisticUpdate(order.version === payload.purchaseOrderVersion ? 1 : 0);
  if (order.status !== 'ordered')
    return receiptError('只有已下单且尚未结束的采购单可以新增到货', 'RECEIPT_STATE');
  const lines = await readLines(connection, payload.purchaseOrderId, true);
  const selectedIds = sortedIds(payload.details.map((detail) => detail.purchaseOrderLineId));
  if (!payload.details.length || payload.details.length > 100)
    return receiptError('到货必须提供 1 至 100 个明细');
  const selected = selectedIds.map((id) => {
    const line = lines.find((row) => String(row.id) === id);
    if (!line || line.status !== 'open')
      return receiptError('采购行已结束或不属于该采购单', 'RECEIPT_STATE');
    for (const detail of payload.details.filter((row) => row.purchaseOrderLineId === id)) {
      requireOptimisticUpdate(line.version === detail.version ? 1 : 0);
      requireQuantity(detail.receivedQuantity, '实收数量');
      if (line.fulfillment_mode === 'existing_receipt')
        return receiptError('该补单承接已到货实物，请在原到货清单分配，不能重复登记到货');
    }
    return { line };
  });
  await requireSuppliers(
    connection,
    selected.map(({ line }) => String(line.supplier_id)),
  );
  const eligibility = await product.requirePurchasableReferences({
    references: selected.map(({ line }) => ({
      itemId: String(line.item_id),
      materialVariantId: String(line.material_variant_id),
    })),
  });
  if (eligibility.status !== 'success') return receiptError(eligibility.message);
  for (const { line } of selected) {
    const [revisions] = await connection.query<(RowDataPacket & { received_quantity: number })[]>(
      'SELECT r.received_quantity FROM procurement_receipt_line l JOIN procurement_receipt_revision r ON r.id=l.current_receipt_revision_id WHERE l.purchase_order_line_id=? ORDER BY l.id FOR SHARE',
      [line.id],
    );
    const entries = payload.details.filter((row) => row.purchaseOrderLineId === String(line.id));
    requireAggregateQuantity(
      [
        ...revisions.map((row) => Number(row.received_quantity)),
        ...entries.map((row) => row.receivedQuantity),
      ],
      '采购行累计实收',
    );
  }
  const [receipt] = await connection.execute<ResultSetHeader>(
    'INSERT INTO procurement_receipt(receipt_no,purchase_order_id,received_at,handover_evidence,remark,created_by) VALUES(?,?,?,?,?,?)',
    [
      `RC-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`,
      order.id,
      new Date(payload.receivedAt),
      payload.handoverEvidence.trim(),
      payload.remark ?? null,
      context.actorId,
    ],
  );
  const receiptId = String(receipt.insertId);
  for (const [index, detail] of payload.details.entries()) {
    const line = lines.find((row) => String(row.id) === detail.purchaseOrderLineId)!;
    const [result] = await connection.execute<ResultSetHeader>(
      'INSERT INTO procurement_receipt_line(receipt_id,purchase_order_id,purchase_order_line_id,line_no,item_id,material_variant_id,supplier_batch_code,over_receipt_note,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?)',
      [
        receiptId,
        order.id,
        line.id,
        index + 1,
        line.item_id,
        line.material_variant_id,
        detail.supplierBatchCode ?? null,
        detail.overReceiptNote ?? null,
        context.actorId,
        context.actorId,
      ],
    );
    const lineId = String(result.insertId);
    const revisionId = await insertRevision(
      connection,
      lineId,
      1,
      null,
      detail.receivedQuantity,
      '首次实收确认',
      context,
    );
    await connection.execute(
      'UPDATE procurement_receipt_line SET current_receipt_revision_id=? WHERE id=?',
      [revisionId, lineId],
    );
    await insertRound(
      connection,
      {
        lineId,
        revisionId,
        previous: null,
        trigger: 'receipt',
        quantity: detail.receivedQuantity,
        status: 'uninspected',
        reason: '首次实收确认',
      },
      context,
    );
  }
  for (const { line } of selected)
    await connection.execute(
      'UPDATE procurement_order_line SET version=version+1,updated_by=? WHERE id=?',
      [context.actorId, line.id],
    );
  await connection.execute(
    'UPDATE procurement_order SET version=version+1,updated_by=? WHERE id=?',
    [context.actorId, order.id],
  );
  await auditReceipt(connection, context, 'receipt.confirm', receiptId, null, payload);
  return {
    receiptId,
    receiptLineId: null,
    caseIds: [],
    inspectionId: null,
    supplierReturnId: null,
  };
};
