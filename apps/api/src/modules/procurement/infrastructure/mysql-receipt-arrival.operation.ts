import { PROCUREMENT_RECEIPT_MAX_LINES } from '@company/constants';
import type { PoolConnection, ResultSetHeader } from 'mysql2/promise';
import type {
  ConfirmProcurementReceiptPayload,
  ProcurementReceiptCommandResult,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { allocateBusinessNumber } from '../../../infrastructure/numbering/mysql-business-number.js';
import { requireOptimisticUpdate } from '../../../common/persistence/optimistic-lock.js';
import type { ProductInventoryEligibility } from '../../product/public.js';
import { readOrder, readLines, sortedIds } from './mysql-purchase-order.shared.js';
import { requireSupplier } from './mysql-purchase-order.write.js';
import { auditReceipt } from './mysql-receipt.shared.js';
import { receiptError } from '../domain/procurement.errors.js';

export async function confirmReceiptArrival(
  db: PoolConnection,
  payload: ConfirmProcurementReceiptPayload,
  context: CommandContext,
  product: ProductInventoryEligibility,
): Promise<ProcurementReceiptCommandResult> {
  const order = await readOrder(db, payload.purchaseOrderId, true);
  requireOptimisticUpdate(order.version === payload.purchaseOrderVersion ? 1 : 0);
  if (order.status !== 'ordered') return receiptError('只有已下单采购可登记到货', 'RECEIPT_STATE');
  if (
    !payload.details.length ||
    payload.details.length > PROCUREMENT_RECEIPT_MAX_LINES ||
    sortedIds(payload.details.map((row) => row.purchaseOrderLineId)).length !==
      payload.details.length
  )
    return receiptError('到货须选择 1 至 100 条不重复采购行');
  const lines = await readLines(db, payload.purchaseOrderId, true);
  const selected = payload.details.map((detail) => {
    const line = lines.find((row) => String(row.id) === detail.purchaseOrderLineId);
    if (!line || line.status !== 'open' || line.fulfillment_mode !== 'new_arrival')
      return receiptError('采购行不属于本单、已结束或不办理新到货', 'RECEIPT_STATE');
    requireOptimisticUpdate(line.version === detail.version ? 1 : 0);
    return line;
  });
  await requireSupplier(db, String(order.supplier_id));
  const eligibility = await product.requirePurchasableReferences({
    references: selected.map((line) => ({
      itemId: String(line.item_id),
      materialVariantId: String(line.material_variant_id),
    })),
  });
  if (eligibility.status !== 'success') return receiptError(eligibility.message);
  const [receipt] = await db.execute<ResultSetHeader>(
    'INSERT INTO procurement_receipt(receipt_no,purchase_order_id,received_at,handover_evidence,remark,created_by,updated_by) VALUES(?,?,?,?,?,?,?)',
    [
      await allocateBusinessNumber(db, 'purchase_receipt'),
      order.id,
      new Date(payload.receivedAt),
      payload.handoverEvidence ?? null,
      payload.remark ?? null,
      context.actorId,
      context.actorId,
    ],
  );
  const receiptId = String(receipt.insertId);
  for (const [index, detail] of payload.details.entries()) {
    const line = selected[index]!;
    await db.execute(
      'INSERT INTO procurement_receipt_line(receipt_id,purchase_order_id,purchase_order_line_id,line_no,item_id,material_variant_id,supplier_batch_code,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?)',
      [
        receiptId,
        order.id,
        line.id,
        index + 1,
        line.item_id,
        line.material_variant_id,
        detail.supplierBatchCode ?? null,
        context.actorId,
        context.actorId,
      ],
    );
    const [updated] = await db.execute<ResultSetHeader>(
      'UPDATE procurement_order_line SET version=version+1,updated_by=? WHERE id=? AND version=?',
      [context.actorId, line.id, detail.version],
    );
    requireOptimisticUpdate(updated.affectedRows);
  }
  const [updated] = await db.execute<ResultSetHeader>(
    'UPDATE procurement_order SET version=version+1,updated_by=? WHERE id=? AND version=?',
    [context.actorId, order.id, payload.purchaseOrderVersion],
  );
  requireOptimisticUpdate(updated.affectedRows);
  await auditReceipt(db, context, 'receipt.confirm', receiptId, null, payload);
  return { receiptId };
}
