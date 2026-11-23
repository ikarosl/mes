import type {
  PageResult,
  ProductionOutputInboundResult,
  ProductionOutputItem,
  ProductionOutputQuery,
} from '@company/contracts';
import type { RowDataPacket } from 'mysql2/promise';
import type { Db } from '../shared/mysql-production-db.js';
import {
  PRODUCTION_OUTPUT_COLUMNS,
  PRODUCTION_OUTPUT_FROM,
  mapProductionOutput,
  type OutputRow,
} from '../tracking/mysql-production-output.read.js';

/** 一条实际入库明细只匹配其原始正流水，历史多单按产出分别读取。 */
export const PRODUCTION_OUTPUT_RECEIPT_SELECT = `SELECT d.production_output_id outputId,
 d.id inboundDetailId,i.id inboundId,i.inbound_no inboundNo,
 ib.id itemBatchId,ib.batch_code batchCode,tx.quantity inboundQuantity
 FROM inbound_detail d
 JOIN inbound_order i ON i.id=d.inbound_id AND i.status='completed' AND i.source_type='finished_product'
 JOIN inventory_transaction tx ON tx.reference_type='inbound_detail' AND tx.reference_detail_id=d.id
   AND tx.transaction_type='production_inbound' AND tx.reversal_of_transaction_id IS NULL
   AND tx.product_id=d.product_id AND tx.batch_id=d.batch_id AND tx.quantity=d.inbound_number AND tx.quantity>0
   AND tx.unit_snapshot=d.unit_snapshot AND tx.stock_status=d.stock_status
 JOIN production_tracking_output receipt_output ON receipt_output.id=d.production_output_id
   AND receipt_output.product_id=d.product_id
   AND receipt_output.production_batch_id=i.production_batch_id AND receipt_output.work_order_id=i.work_order_id
 JOIN item_batch ib ON ib.id=d.batch_id
 WHERE d.is_deleted=0 AND d.source_type='finished_product'`;

/** 展示汇总只累计真实原始入库，不以当前库存余额或整笔产出量代替分次实际接收量。 */
export function productionOutputInboundQuantitySql(
  source: 'o.production_batch_id=b.id' | 'o.work_order_id=wo.id',
): string {
  return `(SELECT CAST(COALESCE(SUM(receipt.inboundQuantity),0) AS CHAR)
    FROM (${PRODUCTION_OUTPUT_RECEIPT_SELECT}) receipt
    JOIN production_tracking_output o ON o.id=receipt.outputId WHERE ${source})`;
}

export type ProductionOutputReceiptRow = RowDataPacket &
  ProductionOutputInboundResult & { outputId: string; inboundDetailId: string };

/** 在分页后批读本页产出的全部入库单，避免历史一盘多单放大产出或刻码行数。 */
export async function selectProductionOutputReceipts(
  db: Db,
  outputIds: readonly string[],
): Promise<Map<string, ProductionOutputInboundResult[]>> {
  const receiptsByOutput = new Map<string, ProductionOutputInboundResult[]>();
  const uniqueOutputIds = [...new Set(outputIds)];
  if (!uniqueOutputIds.length) return receiptsByOutput;
  const [receipts] = await db.query<ProductionOutputReceiptRow[]>(
    `SELECT CAST(actual.outputId AS CHAR) outputId,CAST(actual.inboundDetailId AS CHAR) inboundDetailId,
     CAST(actual.inboundId AS CHAR) inboundId,actual.inboundNo,
     CAST(actual.itemBatchId AS CHAR) itemBatchId,actual.batchCode,CAST(actual.inboundQuantity AS CHAR) inboundQuantity
     FROM (${PRODUCTION_OUTPUT_RECEIPT_SELECT}) actual
     WHERE actual.outputId IN (${uniqueOutputIds.map(() => '?').join(',')})
     ORDER BY actual.inboundDetailId`,
    uniqueOutputIds,
  );
  for (const receipt of receipts) {
    const list = receiptsByOutput.get(receipt.outputId) ?? [];
    list.push({
      inboundId: receipt.inboundId,
      inboundNo: receipt.inboundNo,
      itemBatchId: receipt.itemBatchId,
      batchCode: receipt.batchCode,
      inboundQuantity: String(receipt.inboundQuantity),
    });
    receiptsByOutput.set(receipt.outputId, list);
  }
  return receiptsByOutput;
}

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
    conditions.push(
      'x.id IS NULL AND o.quantity>0 AND COALESCE(receipt.receivedQuantity,0)=o.quantity',
    );
  if (query.status === 'partially_inbounded')
    conditions.push(
      'x.id IS NULL AND receipt.receivedQuantity>0 AND receipt.receivedQuantity<o.quantity',
    );
  if (query.status === 'pending_inbound')
    conditions.push('x.id IS NULL AND COALESCE(receipt.receivedQuantity,0)=0 AND o.quantity>0');
  if (query.status === 'no_inbound_required') conditions.push('x.id IS NULL AND o.quantity=0');
  if (query.pendingOnly)
    conditions.push('x.id IS NULL AND COALESCE(receipt.receivedQuantity,0)=0 AND o.quantity>0');
  const receiptSummary = `LEFT JOIN (SELECT actual.outputId,SUM(actual.inboundQuantity) receivedQuantity
    FROM (${PRODUCTION_OUTPUT_RECEIPT_SELECT}) actual GROUP BY actual.outputId) receipt ON receipt.outputId=o.id`;
  const from = `${PRODUCTION_OUTPUT_FROM} ${receiptSummary} WHERE ${conditions.join(' AND ')}`;
  const [[count]] = await db.query<(RowDataPacket & { total: number })[]>(
    `SELECT COUNT(*) total ${from}`,
    values,
  );
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 10;
  const [rows] = await db.query<OutputRow[]>(
    `SELECT ${PRODUCTION_OUTPUT_COLUMNS} ${from}
     ORDER BY o.confirmed_at DESC,o.id DESC LIMIT ? OFFSET ?`,
    [...values, pageSize, (page - 1) * pageSize],
  );
  const receiptsByOutput = await selectProductionOutputReceipts(
    db,
    rows.map((row) => row.id),
  );
  return {
    items: rows.map((row) => mapProductionOutput(row, receiptsByOutput.get(row.id))),
    total: Number(count?.total ?? 0),
    page,
    pageSize,
  };
}
