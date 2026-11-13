import type { PageResult, ProductionOutputItem, ProductionOutputQuery } from '@company/contracts';
import type { RowDataPacket } from 'mysql2/promise';
import type { Db } from '../shared/mysql-production-db.js';
import {
  PRODUCTION_OUTPUT_COLUMNS,
  PRODUCTION_OUTPUT_FROM,
  mapProductionOutput,
  type OutputRow,
} from '../tracking/mysql-production-output.read.js';

/** 展示汇总只读取实际入库；不以库存余额反推产出，也不用于命令资格。 */
export function productionOutputInboundQuantitySql(
  source: 'o.production_batch_id=b.id' | 'o.work_order_id=wo.id',
): string {
  return `(SELECT CAST(COALESCE(SUM(tx.quantity),0) AS CHAR) FROM inbound_detail d
    JOIN inbound_order i ON i.id=d.inbound_id AND i.status='completed' AND i.source_type='finished_product'
    JOIN inventory_transaction tx ON tx.reference_type='inbound_detail' AND tx.reference_detail_id=d.id
      AND tx.transaction_type='production_inbound' AND tx.reversal_of_transaction_id IS NULL
      AND tx.product_id=d.product_id AND tx.batch_id=d.batch_id AND tx.quantity=d.inbound_number AND tx.quantity>0
      AND tx.unit_snapshot=d.unit_snapshot AND tx.stock_status=d.stock_status
    JOIN production_tracking_output o ON o.id=d.production_output_id AND o.quantity=d.inbound_number
      AND o.product_id=d.product_id AND o.production_batch_id=i.production_batch_id AND o.work_order_id=i.work_order_id
    WHERE ${source} AND d.is_deleted=0 AND d.source_type='finished_product')`;
}

const INBOUND_RECEIPT_SELECT = `SELECT d.production_output_id,CAST(i.id AS CHAR) inboundId,i.inbound_no inboundNo,
 CAST(ib.id AS CHAR) itemBatchId,ib.batch_code batchCode,CAST(tx.quantity AS CHAR) inboundQuantity
 FROM inbound_detail d JOIN inbound_order i ON i.id=d.inbound_id AND i.status='completed' AND i.source_type='finished_product'
 JOIN inventory_transaction tx ON tx.reference_type='inbound_detail' AND tx.reference_detail_id=d.id
   AND tx.transaction_type='production_inbound' AND tx.reversal_of_transaction_id IS NULL
   AND tx.product_id=d.product_id AND tx.batch_id=d.batch_id AND tx.quantity=d.inbound_number AND tx.quantity>0
   AND tx.unit_snapshot=d.unit_snapshot AND tx.stock_status=d.stock_status
 JOIN production_tracking_output receipt_output ON receipt_output.id=d.production_output_id
   AND receipt_output.quantity=d.inbound_number AND receipt_output.product_id=d.product_id
   AND receipt_output.production_batch_id=i.production_batch_id AND receipt_output.work_order_id=i.work_order_id
 JOIN item_batch ib ON ib.id=d.batch_id
 WHERE d.is_deleted=0 AND d.source_type='finished_product'`;
const INBOUND_FROM = `LEFT JOIN (${INBOUND_RECEIPT_SELECT}) receipt ON receipt.production_output_id=o.id`;

export async function listProductionOutputs(
  db: Db,
  query: ProductionOutputQuery,
): Promise<PageResult<ProductionOutputItem>> {
  const conditions = ['1=1'];
  const values: Array<string | number> = [];
  if (query.batchId) {
    conditions.push('o.production_batch_id=?');
    values.push(query.batchId);
  }
  if (query.keyword) {
    conditions.push(
      '(b.batch_no LIKE ? OR wo.work_order_no LIKE ? OR c.card_no LIKE ? OR wo.product_code_snapshot LIKE ? OR wo.product_name_snapshot LIKE ?)',
    );
    values.push(...Array.from({ length: 5 }, () => `%${query.keyword}%`));
  }
  if (query.status === 'cancelled') conditions.push('x.id IS NOT NULL');
  if (query.status === 'inbounded')
    conditions.push('x.id IS NULL AND receipt.inboundId IS NOT NULL');
  if (query.status === 'pending_inbound')
    conditions.push('x.id IS NULL AND receipt.inboundId IS NULL AND o.quantity>0');
  if (query.status === 'no_inbound_required') conditions.push('x.id IS NULL AND o.quantity=0');
  const from = `${PRODUCTION_OUTPUT_FROM} ${INBOUND_FROM} WHERE ${conditions.join(' AND ')}`;
  const [[count]] = await db.query<(RowDataPacket & { total: number })[]>(
    `SELECT COUNT(*) total ${from}`,
    values,
  );
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 10;
  const [rows] = await db.query<OutputRow[]>(
    `SELECT ${PRODUCTION_OUTPUT_COLUMNS},receipt.inboundId,receipt.inboundNo,
     receipt.itemBatchId,receipt.batchCode,receipt.inboundQuantity
     ${from} ORDER BY o.confirmed_at DESC,o.id DESC LIMIT ? OFFSET ?`,
    [...values, pageSize, (page - 1) * pageSize],
  );
  return { items: rows.map(mapProductionOutput), total: Number(count?.total ?? 0), page, pageSize };
}
