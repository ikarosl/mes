import type { PoolConnection, ResultSetHeader } from 'mysql2/promise';
import type {
  CorrectPurchaseOrderAmountsPayload,
  PurchaseOrderCommandResult,
} from '@company/contracts';
import { PROCUREMENT_ERROR_CODES } from '@company/constants';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { requireOptimisticUpdate } from '../../../common/persistence/optimistic-lock.js';
import {
  normalizePurchaseAmountsCorrection,
  normalizePurchaseLineAmount,
} from '../domain/purchase-order.policy.js';
import { type OrderRow, orderError, readLines } from './mysql-purchase-order.shared.js';
import { auditOrder } from './mysql-purchase-order.write.js';

/** The caller holds the current purchase root and any original roots in numeric order. */
export const correctPurchaseOrderAmounts = async (
  connection: PoolConnection,
  order: OrderRow,
  payload: CorrectPurchaseOrderAmountsPayload,
  context: CommandContext,
): Promise<PurchaseOrderCommandResult> => {
  if (order.status !== 'ordered' && order.status !== 'completed')
    return orderError(
      '仅已下单或已结束采购可以更正采购金额',
      PROCUREMENT_ERROR_CODES.purchaseOrderState,
    );
  requireOptimisticUpdate(order.version === payload.version ? 1 : 0);
  const body = normalizePurchaseAmountsCorrection(payload);
  const orderId = String(order.id);
  const lines = await readLines(connection, orderId, true);
  const lineById = new Map(lines.map((line) => [String(line.id), line]));
  // Validate the whole batch before any write so a bad later row cannot be partially applied.
  const changes = body.items.map((item) => {
    const line = lineById.get(item.id);
    if (!line) return orderError('金额更正明细不属于本采购单');
    requireOptimisticUpdate(line.version === item.version ? 1 : 0);
    if (line.status !== 'open' && line.status !== 'closed')
      return orderError('该采购行不能更正采购金额', PROCUREMENT_ERROR_CODES.purchaseOrderState);
    const amount = normalizePurchaseLineAmount({
      plannedQuantity: line.planned_quantity,
      taxExclusiveAmount: item.taxExclusiveAmount,
      taxInclusiveAmount: item.taxInclusiveAmount,
      taxRatePercent: item.taxRatePercent,
      manualTotalAmount: item.manualTotalAmount,
    });
    const current = normalizePurchaseLineAmount({
      plannedQuantity: 1,
      taxExclusiveAmount: line.tax_exclusive_amount,
      taxInclusiveAmount: line.tax_inclusive_amount,
      taxRatePercent: line.tax_rate_percent,
    });
    if (
      current.taxExclusiveAmount === amount.taxExclusiveAmount &&
      current.taxInclusiveAmount === amount.taxInclusiveAmount &&
      current.taxRatePercent === amount.taxRatePercent &&
      line.total_amount === amount.totalAmount &&
      line.total_amount_source === amount.totalAmountSource
    )
      return orderError('金额更正须仅提交单价、税率或总金额有变更的明细');
    return { line, amount };
  });
  for (const { line, amount } of changes) {
    const [result] = await connection.execute<ResultSetHeader>(
      'UPDATE procurement_order_line SET tax_exclusive_amount=?,tax_inclusive_amount=?,tax_rate_percent=?,total_amount=?,total_amount_source=?,version=version+1,updated_by=? WHERE id=? AND purchase_order_id=? AND version=?',
      [
        amount.taxExclusiveAmount,
        amount.taxInclusiveAmount,
        amount.taxRatePercent,
        amount.totalAmount,
        amount.totalAmountSource,
        context.actorId,
        line.id,
        orderId,
        line.version,
      ],
    );
    requireOptimisticUpdate(result.affectedRows);
  }
  const [orderResult] = await connection.execute<ResultSetHeader>(
    'UPDATE procurement_order SET version=version+1,updated_by=? WHERE id=? AND version=?',
    [context.actorId, orderId, order.version],
  );
  requireOptimisticUpdate(orderResult.affectedRows);
  await auditOrder(
    connection,
    context,
    'purchase-order.correct-amounts',
    orderId,
    {
      version: order.version,
      items: changes.map(({ line }) => ({
        id: String(line.id),
        version: line.version,
        taxExclusiveAmount: line.tax_exclusive_amount,
        taxInclusiveAmount: line.tax_inclusive_amount,
        taxRatePercent: line.tax_rate_percent,
        totalAmount: line.total_amount,
        totalAmountSource: line.total_amount_source,
      })),
    },
    {
      version: order.version + 1,
      reason: body.reason,
      items: changes.map(({ line, amount }) => ({
        id: String(line.id),
        version: line.version + 1,
        taxExclusiveAmount: amount.taxExclusiveAmount,
        taxInclusiveAmount: amount.taxInclusiveAmount,
        taxRatePercent: amount.taxRatePercent,
        totalAmount: amount.totalAmount,
        totalAmountSource: amount.totalAmountSource,
      })),
    },
  );
  return { purchaseOrderId: orderId, version: order.version + 1 };
};
