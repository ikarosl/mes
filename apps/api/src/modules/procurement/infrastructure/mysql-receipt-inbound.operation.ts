import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  ConfirmProcurementInboundPayload,
  ConfirmProcurementInboundResult,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { requireOptimisticUpdate } from '../../../common/persistence/optimistic-lock.js';
import type { ProductInventoryEligibility } from '../../product/public.js';
import type { QualityInboundQuery } from '../../quality/public.js';
import type { InventoryInboundCommand, InventoryInboundQuery } from '../../inventory/public.js';
import {
  readOrder,
  readLines,
  sortedIds,
  idsSql,
  type OrderLineRow,
} from './mysql-purchase-order.shared.js';
import {
  type ReceiptLineRow,
  type AllocationRow,
  readAllocations,
  lockReceiptRoots,
  requireAllocation,
  requireQuantity,
  receiptError,
  touchReceiptLine,
  auditReceipt,
} from './mysql-receipt.shared.js';

import { lockRound, receiptBalance } from './mysql-receipt-round.shared.js';

export const confirmReceiptInbound = async (
  connection: PoolConnection,
  payload: ConfirmProcurementInboundPayload,
  context: CommandContext,
  product: ProductInventoryEligibility,
  quality: QualityInboundQuery,
  inventory: InventoryInboundCommand,
  inventoryQuery: InventoryInboundQuery,
): Promise<ConfirmProcurementInboundResult> => {
  if (
    !payload.details.length ||
    payload.details.length > 100 ||
    new Set(payload.details.map((row) => row.allocationId)).size !== payload.details.length
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
  await lockReceiptRoots(connection, lineIds);
  const orders = [];
  const orderLines = new Map<string, OrderLineRow>();
  for (const orderId of sortedIds(locators.map((row) => String(row.purchase_order_id))))
    orders.push(await readOrder(connection, orderId, true));
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
  const allocations = new Map<string, AllocationRow[]>();
  for (const id of lineIds) {
    const [[line]] = await connection.query<ReceiptLineRow[]>(
      'SELECT * FROM procurement_receipt_line WHERE id=? FOR UPDATE',
      [id],
    );
    if (!line) return receiptError('到货明细不存在', 'RECEIPT_NOT_FOUND');
    lines.set(id, line);
    allocations.set(id, await readAllocations(connection, id, inventoryQuery));
  }
  for (const id of lineIds) {
    const { remaining } = await receiptBalance(connection, lines.get(id)!, allocations.get(id)!);
    const active = allocations
      .get(id)!
      .filter(
        (s) =>
          String(s.round_id) === String(lines.get(id)!.current_round_id) &&
          s.round_status === 'finalized',
      );
    if (active.reduce((sum, s) => sum + s.remaining_quantity, 0) !== remaining)
      return receiptError('正式可处置量与本批剩余实物不一致', 'RECEIPT_STATE');
  }
  const supplierIds = sortedIds(
    [...lines.values()].map((line) => {
      const orderLine = orderLines.get(String(line.purchase_order_line_id));
      if (!orderLine || String(orderLine.purchase_order_id) !== String(line.purchase_order_id))
        return receiptError('采购来源归属已变化', 'RECEIPT_STATE');
      return String(orderLine.supplier_id);
    }),
  );
  if (supplierIds.length !== 1) return receiptError('同一次入库确认必须来自同一供应商，请分别确认');
  const [[supplier]] = await connection.query<(RowDataPacket & { supplier_name: string })[]>(
    'SELECT supplier_name FROM procurement_supplier WHERE id=? AND is_deleted=0 FOR SHARE',
    [supplierIds[0]],
  );
  if (!supplier) return receiptError('供应商不存在或已删除');
  const selected = [];
  for (const detail of payload.details) {
    const line = lines.get(detail.receiptLineId)!;
    requireOptimisticUpdate(line.version === detail.version ? 1 : 0);
    const round = await lockRound(connection, line, detail);
    if (round.status !== 'finalized')
      return receiptError('本轮尚未定稿或已开始复检，请刷新', 'RECEIPT_STATE');
    const row = requireAllocation(
      allocations.get(detail.receiptLineId)!,
      detail.allocationId,
      String(round.id),
    );
    requireQuantity(detail.quantity, '入库数量');
    if (
      row.disposition !== 'inbound' ||
      String(round.inspection_id) !== detail.inspectionId ||
      String(line.current_receipt_revision_id) !== detail.receiptRevisionId ||
      row.acceptance_id === null ||
      row.termination_reason !== null ||
      String(row.receipt_revision_id) !== detail.receiptRevisionId ||
      String(row.inspection_id) !== detail.inspectionId ||
      detail.quantity > row.remaining_quantity
    )
      return receiptError('正式分配、实收版本或可入剩余量已变化，请刷新', 'RECEIPT_STATE');
    selected.push({ detail, line, row });
  }
  for (const inspectionId of sortedIds(selected.map(({ detail }) => detail.inspectionId))) {
    const review = await quality.getCaseByInspection(inspectionId);
    const selectedRow = selected.find(({ detail }) => detail.inspectionId === inspectionId)!;
    if (!review) return receiptError('质检依据不存在', 'RECEIPT_STATE');
    await quality.requireReleaseBasis({
      inspectionId,
      caseId: review.id,
      receiptLineId: selectedRow.detail.receiptLineId,
    });
  }
  const details = selected.map(({ detail, line }) => {
    const orderLine = orderLines.get(String(line.purchase_order_line_id))!;
    return {
      receiptLineId: detail.receiptLineId,
      receiptRevisionId: detail.receiptRevisionId,
      inspectionId: detail.inspectionId,
      allocationId: detail.allocationId,
      itemId: String(line.item_id),
      materialVariantId: String(line.material_variant_id),
      itemCode: orderLine.item_code_snapshot,
      materialVariantCode: orderLine.material_variant_code_snapshot,
      unit: orderLine.unit_snapshot,
      quantity: String(detail.quantity),
      batchId: line.batch_id === null ? null : String(line.batch_id),
    };
  });
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
