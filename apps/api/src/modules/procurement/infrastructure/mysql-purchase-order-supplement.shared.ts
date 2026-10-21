import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { PurchaseOrderSupplementReason } from '@company/contracts';
import type { InventoryInboundQuery } from '../../inventory/public.js';
import { orderError } from './mysql-purchase-order.shared.js';

/** 创建和下单共用原采购行及到货身份校验，不以当前处理轮替代固定来源。 */
export async function requireSupplementIdentity(
  connection: PoolConnection,
  lineId: string,
  receiptLineId?: string,
): Promise<void> {
  if (!receiptLineId) return orderError('补单必须关联真实到货明细');
  const [[receipt]] = await connection.query<(RowDataPacket & { receipt_id: number })[]>(
    'SELECT receipt_id FROM procurement_receipt_line WHERE id=? AND purchase_order_line_id=? FOR SHARE',
    [receiptLineId, lineId],
  );
  if (!receipt) return orderError('原到货不属于所选原采购行');
  const [[registration]] = await connection.query<(RowDataPacket & { is_voided: number })[]>(
    'SELECT is_voided FROM procurement_receipt WHERE id=? FOR SHARE',
    [receipt.receipt_id],
  );
  if (!registration) return orderError('原到货登记不存在');
  if (Number(registration.is_voided) === 1)
    return orderError('原到货登记已作废，不能继续创建或办理关联补单');
}

/** 仅新建时核验到货资格；已有补单下单只通过固定来源身份校验。 */
export async function requireSupplementCreationEligibility(
  connection: PoolConnection,
  reason: PurchaseOrderSupplementReason,
  receiptLineId: string,
  inventory: InventoryInboundQuery,
): Promise<void> {
  if (reason === 'quality_replacement') {
    const [[eligible]] = await connection.query<RowDataPacket[]>(
      `SELECT a.id FROM procurement_receipt_allocation a
       JOIN procurement_receipt_line l ON l.id=a.receipt_line_id
       JOIN procurement_receipt_round r ON r.id=a.round_id
       WHERE a.receipt_line_id=? AND a.disposition='return' AND a.return_reason='quality'
         AND ((l.current_round_id=a.round_id AND r.status='finalized')
           OR EXISTS(SELECT 1 FROM procurement_supplier_return sr
             WHERE sr.allocation_id=a.id AND sr.reason_type='quality' AND sr.returned_quantity>0))
       LIMIT 1 FOR SHARE`,
      [receiptLineId],
    );
    if (!eligible) return orderError('该到货没有当前有效质量退回或真实质量已退，不能新建质量补单');
    return;
  }

  const facts = await inventory.getReceiptInboundFacts({ receiptLineIds: [receiptLineId] });
  if (
    facts.some((fact) => fact.receiptLineId === receiptLineId && Number(fact.inboundQuantity) > 0)
  )
    return;
  // 无真实已入时，只有当前正式可入授权可作为超量补购来源。
  const [[eligible]] = await connection.query<(RowDataPacket & { inspection_id: number })[]>(
    `SELECT acceptance.inspection_record_id inspection_id FROM procurement_receipt_allocation a
     JOIN procurement_receipt_line l ON l.id=a.receipt_line_id
     JOIN procurement_receipt_round r ON r.id=a.round_id
     JOIN procurement_receipt_acceptance acceptance ON acceptance.id=a.acceptance_id
       AND acceptance.round_id=r.id AND acceptance.receipt_line_id=l.id
     WHERE a.receipt_line_id=? AND l.current_round_id=a.round_id AND r.status='finalized'
       AND a.disposition='inbound' AND a.acceptance_id IS NOT NULL
       AND a.termination_reason IS NULL AND a.quantity>0
       AND acceptance.after_receipt_revision_id=l.current_receipt_revision_id
       AND acceptance.inspection_record_id=r.inspection_id
     ORDER BY a.id LIMIT 1 FOR SHARE`,
    [receiptLineId],
  );
  if (!eligible) return orderError('原到货没有当前有效可入剩余或真实已入库，不能新建超量补单');
}
