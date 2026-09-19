import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  ConfirmProcurementInboundPayload,
  ConfirmProcurementInboundResult,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { requireOptimisticUpdate } from '../../../common/persistence/optimistic-lock.js';
import type { ProductInventoryEligibility } from '../../product/public.js';
import type { QualityInboundQuery } from '../../quality/public.js';
import type { InventoryInboundCommand } from '../../inventory/public.js';
import {
  readOrder,
  readLines,
  sortedIds,
  idsSql,
  type OrderLineRow,
} from './mysql-purchase-order.shared.js';
import {
  type ReceiptLineRow,
  type ScopeRow,
  readScopes,
  requireScope,
  requireQuantity,
  receiptError,
  supersedeScope,
  inheritScope,
  insertScope,
  touchReceiptLine,
  auditReceipt,
} from './mysql-receipt.shared.js';

export const confirmReceiptInbound = async (
  connection: PoolConnection,
  payload: ConfirmProcurementInboundPayload,
  context: CommandContext,
  product: ProductInventoryEligibility,
  quality: QualityInboundQuery,
  inventory: InventoryInboundCommand,
): Promise<ConfirmProcurementInboundResult> => {
  if (
    !payload.details.length ||
    payload.details.length > 100 ||
    new Set(payload.details.map((row) => row.scopeId)).size !== payload.details.length
  )
    return receiptError('入库必须选择 1 至 100 个不同放行范围');
  const lineIds = sortedIds(payload.details.map((row) => row.receiptLineId));
  const [locators] = await connection.query<
    (RowDataPacket & { id: number; purchase_order_id: number })[]
  >(
    `SELECT id,purchase_order_id FROM procurement_receipt_line WHERE id IN (${idsSql(lineIds)})`,
    lineIds,
  );
  if (locators.length !== lineIds.length)
    return receiptError('到货明细不存在', 'RECEIPT_NOT_FOUND');
  const orders = [];
  const orderLines = new Map<string, OrderLineRow>();
  for (const orderId of sortedIds(locators.map((row) => String(row.purchase_order_id))))
    orders.push(await readOrder(connection, orderId, true));
  if (new Set(orders.map((order) => String(order.supplier_id))).size !== 1)
    return receiptError('同一次入库确认必须来自同一供应商');
  const [[supplier]] = await connection.query<(RowDataPacket & { supplier_name: string })[]>(
    'SELECT supplier_name FROM procurement_supplier WHERE id=? FOR SHARE',
    [orders[0]!.supplier_id],
  );
  for (const order of orders)
    for (const line of await readLines(connection, String(order.id), true))
      orderLines.set(String(line.id), line);
  const [identities] = await connection.query<ReceiptLineRow[]>(
    `SELECT * FROM procurement_receipt_line WHERE id IN (${idsSql(lineIds)}) ORDER BY id`,
    lineIds,
  );
  const eligibility = await product.requirePurchasableReferences({
    references: identities.map((line) => ({
      itemId: String(line.item_id),
      materialVariantId: String(line.material_variant_id),
    })),
  });
  if (eligibility.status !== 'success') return receiptError(eligibility.message);
  const lines = new Map<string, ReceiptLineRow>();
  const scopes = new Map<string, ScopeRow[]>();
  for (const id of lineIds) {
    const [[line]] = await connection.query<ReceiptLineRow[]>(
      'SELECT * FROM procurement_receipt_line WHERE id=? FOR UPDATE',
      [id],
    );
    if (!line) return receiptError('到货明细不存在', 'RECEIPT_NOT_FOUND');
    lines.set(id, line);
    scopes.set(id, await readScopes(connection, id));
  }
  const selected = [];
  for (const detail of payload.details) {
    const line = lines.get(detail.receiptLineId)!;
    requireOptimisticUpdate(line.version === detail.version ? 1 : 0);
    const scope = requireScope(
      scopes.get(detail.receiptLineId)!,
      detail.scopeId,
      detail.scopeVersion,
    );
    requireQuantity(detail.quantity, '入库数量');
    if (
      scope.disposition !== 'approved' ||
      scope.termination_root_scope_id !== null ||
      String(scope.receipt_revision_id) !== detail.receiptRevisionId ||
      String(scope.inspection_id) !== detail.inspectionId ||
      scope.review_case_id === null ||
      detail.quantity > Number(scope.quantity)
    )
      return receiptError('放行范围、数量或质检依据已变化，请刷新', 'RECEIPT_STATE');
    selected.push({ detail, line, scope });
  }
  for (const { detail, scope } of [...selected].sort((a, b) =>
    BigInt(a.scope.review_case_id!) < BigInt(b.scope.review_case_id!)
      ? -1
      : BigInt(a.scope.review_case_id!) > BigInt(b.scope.review_case_id!)
        ? 1
        : 0,
  ))
    await quality.requireReleaseBasis({
      inspectionId: detail.inspectionId,
      caseId: String(scope.review_case_id),
      receiptLineId: detail.receiptLineId,
      receiptRevisionId: detail.receiptRevisionId,
    });
  const details = [];
  for (const { detail, line, scope } of selected) {
    let scopeId = String(scope.id);
    if (detail.quantity < Number(scope.quantity)) {
      await supersedeScope(connection, scope, context);
      await insertScope(
        connection,
        { ...inheritScope(scope), quantity: Number(scope.quantity) - detail.quantity },
        context,
      );
      scopeId = await insertScope(
        connection,
        { ...inheritScope(scope), quantity: detail.quantity },
        context,
      );
    }
    const orderLine = orderLines.get(String(line.purchase_order_line_id))!;
    details.push({
      receiptLineId: detail.receiptLineId,
      receiptRevisionId: detail.receiptRevisionId,
      inspectionId: detail.inspectionId,
      scopeId,
      itemId: String(line.item_id),
      materialVariantId: String(line.material_variant_id),
      itemCode: orderLine.item_code_snapshot,
      materialVariantCode: orderLine.material_variant_code_snapshot,
      unit: orderLine.unit_snapshot,
      quantity: String(detail.quantity),
      batchId: line.batch_id === null ? null : String(line.batch_id),
    });
  }
  const result = await inventory.confirmPurchaseReceipt(
    { provider: supplier!.supplier_name, remark: payload.remark ?? null, details },
    context,
  );
  for (const detail of result.details) {
    const line = lines.get(detail.receiptLineId)!;
    if (line.batch_id === null) {
      const [binding] = await connection.execute<ResultSetHeader>(
        'UPDATE procurement_receipt_line SET batch_id=? WHERE id=? AND batch_id IS NULL',
        [detail.batchId, detail.receiptLineId],
      );
      if (binding.affectedRows !== 1) return receiptError('内部批号绑定已变化', 'RECEIPT_STATE');
      line.batch_id = detail.batchId;
    } else if (String(line.batch_id) !== detail.batchId)
      return receiptError('同一到货必须沿用首次入库内部批号', 'RECEIPT_STATE');
    await connection.execute(
      "UPDATE procurement_receipt_scope SET disposition='inbounded',transition_type='inbound',version=version+1,updated_by=? WHERE id=?",
      [context.actorId, detail.scopeId],
    );
  }
  for (const id of lineIds) await touchReceiptLine(connection, id, context);
  for (const receiptId of sortedIds([...lines.values()].map((line) => String(line.receipt_id))))
    await auditReceipt(connection, context, 'receipt.inbound', receiptId, null, {
      inboundId: result.inboundId,
      details: result.details.filter(
        (detail) => String(lines.get(detail.receiptLineId)!.receipt_id) === receiptId,
      ),
    });
  return result;
};
