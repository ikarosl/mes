import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type {
  ConfirmProcurementInboundPayload,
  ConfirmProcurementInboundResult,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { requireOptimisticUpdate } from '../../../common/persistence/optimistic-lock.js';
import type {
  InventoryInboundCommand,
  PurchaseReceiptInboundLine,
} from '../../inventory/public.js';
import {
  readLines,
  readOrder,
  sortedIds,
  idsSql,
  type OrderRow,
  type OrderLineRow,
} from './mysql-purchase-order.shared.js';
import { lockReceiptLines, touchReceiptLine, auditReceipt } from './mysql-receipt.shared.js';
import { receiptError } from '../domain/procurement.errors.js';
import { requireQuantity } from '../domain/receipt-quantity.policy.js';

export async function confirmReceiptInbound(
  db: PoolConnection,
  payload: ConfirmProcurementInboundPayload,
  context: CommandContext,
  inventory: InventoryInboundCommand,
): Promise<ConfirmProcurementInboundResult> {
  if (!payload.details.length || payload.details.length > 100)
    return receiptError('请提交 1 至 100 条实际入库明细');
  const lines = await lockReceiptLines(
    db,
    payload.details.map((row) => row.receiptLineId),
  );
  const byId = new Map(lines.map((line) => [String(line.id), line]));
  const orders = new Map<string, OrderRow>();
  const orderLines = new Map<string, OrderLineRow>();
  for (const orderId of sortedIds(lines.map((line) => String(line.purchase_order_id)))) {
    orders.set(orderId, await readOrder(db, orderId, true));
    for (const row of await readLines(db, orderId, true)) orderLines.set(String(row.id), row);
  }
  const supplierIds = sortedIds([...orders.values()].map((order) => String(order.supplier_id)));
  const [suppliers] = await db.query<(RowDataPacket & { id: number; supplier_name: string })[]>(
    `SELECT id,supplier_name FROM procurement_supplier WHERE id IN (${idsSql(supplierIds)}) AND is_deleted=0 ORDER BY id FOR SHARE`,
    supplierIds,
  );
  if (suppliers.length !== supplierIds.length) return receiptError('来源供应商不存在或已删除');
  const supplierNames = new Map(suppliers.map((row) => [String(row.id), row.supplier_name]));
  const posting: PurchaseReceiptInboundLine[] = [];
  for (const detail of payload.details) {
    const line = byId.get(detail.receiptLineId);
    if (!line) return receiptError('到货明细不存在', 'RECEIPT_NOT_FOUND');
    requireOptimisticUpdate(line.version === detail.version ? 1 : 0);
    requireQuantity(detail.quantity, '实际入库数量');
    if (!detail.target) return receiptError('实际入库须选择目标库存批次');
    const source = orderLines.get(String(line.purchase_order_line_id));
    if (
      !source ||
      String(source.purchase_order_id) !== String(line.purchase_order_id) ||
      String(source.item_id) !== String(line.item_id) ||
      String(source.material_variant_id) !== String(line.material_variant_id)
    )
      return receiptError('到货与采购物料来源不一致', 'RECEIPT_STATE');
    const order = orders.get(String(line.purchase_order_id));
    const supplierName = order && supplierNames.get(String(order.supplier_id));
    if (!supplierName) return receiptError('到货供应商来源不一致', 'RECEIPT_STATE');
    posting.push({
      receiptLineId: detail.receiptLineId,
      itemId: String(line.item_id),
      materialVariantId: String(line.material_variant_id),
      itemCode: source.item_code_snapshot,
      materialVariantCode: source.material_variant_code_snapshot,
      unit: source.unit_snapshot,
      supplierNameSnapshot: supplierName,
      quantity: String(detail.quantity),
      target: detail.target,
    });
  }
  const result = await inventory.confirmPurchaseReceipt(
    { remark: payload.remark ?? null, details: posting },
    context,
  );
  for (const line of lines) await touchReceiptLine(db, String(line.id), line.version, context);
  for (const receiptId of sortedIds(lines.map((line) => String(line.receipt_id))))
    await auditReceipt(db, context, 'receipt.inbound', receiptId, null, {
      inboundId: result.inboundId,
      details: result.details.filter(
        (detail) => String(byId.get(detail.receiptLineId)?.receipt_id) === receiptId,
      ),
    });
  return result;
}
