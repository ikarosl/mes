import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { orderError } from './mysql-purchase-order.shared.js';

/** 创建和下单共用有效原采购行与到货身份校验。 */
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
