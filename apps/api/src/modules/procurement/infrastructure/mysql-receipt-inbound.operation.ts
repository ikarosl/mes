import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
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
    new Set(payload.details.map((row) => row.detailKey)).size !== payload.details.length
  )
    return receiptError('入库必须提交 1 至 100 条不同明细');
  const lineIds = sortedIds(payload.details.map((row) => row.receiptLineId));
  const [locators] = await connection.query<
    (RowDataPacket & { id: number; purchase_order_id: number })[]
  >(
    `SELECT id,purchase_order_id FROM procurement_receipt_line WHERE id IN (${idsSql(lineIds)})`,
    lineIds,
  );
  if (locators.length !== lineIds.length)
    return receiptError('到货明细不存在', 'RECEIPT_NOT_FOUND');
  const lockedOrderIds = await lockReceiptRoots(connection, lineIds);
  const orders = [];
  const orderLines = new Map<string, OrderLineRow>();
  for (const orderId of lockedOrderIds) orders.push(await readOrder(connection, orderId, true));
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
  for (const line of lines.values()) {
    const original = orderLines.get(String(line.purchase_order_line_id));
    if (!original || String(original.purchase_order_id) !== String(line.purchase_order_id))
      return receiptError('采购来源归属已变化', 'RECEIPT_STATE');
  }
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
    const assignedLine = orderLines.get(String(row.purchase_order_line_id));
    if (
      !assignedLine ||
      String(assignedLine.supplier_id) !==
        String(orderLines.get(String(line.purchase_order_line_id))!.supplier_id) ||
      String(assignedLine.item_id) !== String(line.item_id) ||
      String(assignedLine.material_variant_id) !== String(line.material_variant_id)
    )
      return receiptError('正式分配采购来源归属已变化', 'RECEIPT_STATE');
    selected.push({ detail, line, row, assignedLine });
  }
  const supplierIds = sortedIds(
    selected.map(({ assignedLine }) => String(assignedLine.supplier_id)),
  );
  const [suppliers] = await connection.query<
    (RowDataPacket & { id: number; supplier_name: string })[]
  >(
    `SELECT id,supplier_name FROM procurement_supplier WHERE id IN (${idsSql(supplierIds)})
     AND is_deleted=0 ORDER BY id FOR SHARE`,
    supplierIds,
  );
  if (suppliers.length !== supplierIds.length) return receiptError('供应商不存在或已删除');
  const supplierNames = new Map(
    suppliers.map((supplier) => [String(supplier.id), supplier.supplier_name]),
  );
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
  const amountByAllocation = new Map<string, number>();
  for (const { detail, row } of selected) {
    const total = (amountByAllocation.get(detail.allocationId) ?? 0) + detail.quantity;
    if (!Number.isSafeInteger(total) || total > row.remaining_quantity)
      return receiptError('本次入库合计超过正式分配剩余量，请刷新', 'RECEIPT_STATE');
    amountByAllocation.set(detail.allocationId, total);
  }
  const details = selected.map(({ detail, line, assignedLine }) => {
    const original = orderLines.get(String(line.purchase_order_line_id))!;
    return {
      detailKey: detail.detailKey,
      receiptLineId: detail.receiptLineId,
      receiptRevisionId: detail.receiptRevisionId,
      inspectionId: detail.inspectionId,
      allocationId: detail.allocationId,
      itemId: String(line.item_id),
      materialVariantId: String(line.material_variant_id),
      itemCode: original.item_code_snapshot,
      materialVariantCode: original.material_variant_code_snapshot,
      unit: original.unit_snapshot,
      supplierNameSnapshot: supplierNames.get(String(assignedLine.supplier_id))!,
      quantity: String(detail.quantity),
      target: detail.target,
    };
  });
  const result = await inventory.confirmPurchaseReceipt(
    { remark: payload.remark ?? null, details },
    context,
  );
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
