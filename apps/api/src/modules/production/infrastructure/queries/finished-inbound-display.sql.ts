import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import type {
  FinishedGoodsInboundQuery,
  FinishedGoodsInboundOrderDetail,
  FinishedGoodsInboundOrderItem,
  FinishedGoodsInboundOrderLine,
} from '@company/contracts';
import { toBeijingISOString } from '../../../../common/time/date-time.js';
import { ProductionDomainError } from '../../domain/production.errors.js';
type Row = RowDataPacket & {
  inbound_id: number;
  inbound_no: string;
  status: 'completed';
  production_batch_id: number;
  batch_no: string;
  work_order_id: number;
  work_order_no: string;
  product_id: number;
  product_code: string;
  product_name: string;
  unit: string;
  created_by: number;
  created_at: Date;
  inbound_at: Date;
  remark: string | null;
  detail_id: number;
  allocation_id: number;
  revision_id: number;
  revision_no: number;
  category: 'self_made' | 'production_extra';
  quantity: string;
  batch_id: number;
  batch_code: string;
  transaction_id: number;
};
const COLUMNS = `o.id inbound_id,o.inbound_no,o.status,o.production_batch_id,b.batch_no,o.work_order_id,
 wo.work_order_no,o.product_id,wo.product_code_snapshot product_code,wo.product_name_snapshot product_name,
 wo.unit_snapshot unit,o.created_by,o.created_at,o.inbound_at,o.remark,d.id detail_id,a.id allocation_id,
 r.id revision_id,r.revision_no,a.category,d.inbound_number quantity,d.batch_id,ib.batch_code,
 tx.id transaction_id`;
function where(query: FinishedGoodsInboundQuery): { sql: string; values: Array<string | number> } {
  const clauses = ["o.source_type='finished_product'", "o.status='completed'"];
  const values: Array<string | number> = [];
  if (query.sourceType) {
    clauses.push('a.category=?');
    values.push(query.sourceType);
  }
  if (query.keyword?.trim()) {
    clauses.push(
      '(o.inbound_no LIKE ? OR b.batch_no LIKE ? OR wo.work_order_no LIKE ? OR wo.product_code_snapshot LIKE ? OR wo.product_name_snapshot LIKE ? OR ib.batch_code LIKE ?)',
    );
    values.push(...Array<string>(6).fill(`%${query.keyword.trim()}%`));
  }
  return { sql: clauses.join(' AND '), values };
}
export async function listFinishedOrders(pool: Pool, query: FinishedGoodsInboundQuery) {
  const page = query.page ?? 1,
    pageSize = query.pageSize ?? 20,
    { sql, values } = where(query);
  const [[count]] = await pool.query<(RowDataPacket & { total: number })[]>(
    `SELECT COUNT(DISTINCT o.id) total FROM inbound_order o JOIN inbound_detail d ON d.inbound_id=o.id
 JOIN production_output_allocation a ON a.id=d.production_output_allocation_id
 JOIN production_output_revision r ON r.id=a.revision_id
 JOIN production_batches b ON b.id=o.production_batch_id
 JOIN work_orders wo ON wo.id=o.work_order_id
 JOIN item_batch ib ON ib.id=d.batch_id
 JOIN inventory_transaction tx ON tx.reference_type='inbound_detail' AND tx.reference_detail_id=d.id
   AND tx.transaction_type='production_inbound' AND tx.product_id=d.product_id AND tx.batch_id=d.batch_id
   AND tx.quantity=d.inbound_number AND tx.unit_snapshot=d.unit_snapshot AND tx.stock_status=d.stock_status WHERE ${sql}`,
    values,
  );
  const [ids] = await pool.query<(RowDataPacket & { id: number })[]>(
    `SELECT DISTINCT o.id FROM inbound_order o JOIN inbound_detail d ON d.inbound_id=o.id
 JOIN production_output_allocation a ON a.id=d.production_output_allocation_id
 JOIN production_output_revision r ON r.id=a.revision_id
 JOIN production_batches b ON b.id=o.production_batch_id
 JOIN work_orders wo ON wo.id=o.work_order_id
 JOIN item_batch ib ON ib.id=d.batch_id
 JOIN inventory_transaction tx ON tx.reference_type='inbound_detail' AND tx.reference_detail_id=d.id
   AND tx.transaction_type='production_inbound' AND tx.product_id=d.product_id AND tx.batch_id=d.batch_id
   AND tx.quantity=d.inbound_number AND tx.unit_snapshot=d.unit_snapshot AND tx.stock_status=d.stock_status WHERE ${sql} ORDER BY o.id DESC LIMIT ? OFFSET ?`,
    [...values, pageSize, (page - 1) * pageSize],
  );
  if (!ids.length) return { items: [], total: Number(count?.total ?? 0), page, pageSize };
  const [rows] = await pool.query<Row[]>(
    `SELECT ${COLUMNS} FROM inbound_order o JOIN inbound_detail d ON d.inbound_id=o.id
 JOIN production_output_allocation a ON a.id=d.production_output_allocation_id
 JOIN production_output_revision r ON r.id=a.revision_id
 JOIN production_batches b ON b.id=o.production_batch_id
 JOIN work_orders wo ON wo.id=o.work_order_id
 JOIN item_batch ib ON ib.id=d.batch_id
 JOIN inventory_transaction tx ON tx.reference_type='inbound_detail' AND tx.reference_detail_id=d.id
   AND tx.transaction_type='production_inbound' AND tx.product_id=d.product_id AND tx.batch_id=d.batch_id
   AND tx.quantity=d.inbound_number AND tx.unit_snapshot=d.unit_snapshot AND tx.stock_status=d.stock_status WHERE o.id IN (${ids.map(() => '?').join(',')}) ORDER BY o.id DESC,d.id`,
    ids.map((row) => row.id),
  );
  return { items: group(rows), total: Number(count?.total ?? 0), page, pageSize };
}
export async function getFinishedOrder(
  pool: Pool | PoolConnection,
  id: string,
): Promise<FinishedGoodsInboundOrderDetail> {
  const [rows] = await pool.query<Row[]>(
    `SELECT ${COLUMNS} FROM inbound_order o JOIN inbound_detail d ON d.inbound_id=o.id
 JOIN production_output_allocation a ON a.id=d.production_output_allocation_id
 JOIN production_output_revision r ON r.id=a.revision_id
 JOIN production_batches b ON b.id=o.production_batch_id
 JOIN work_orders wo ON wo.id=o.work_order_id
 JOIN item_batch ib ON ib.id=d.batch_id
 JOIN inventory_transaction tx ON tx.reference_type='inbound_detail' AND tx.reference_detail_id=d.id
   AND tx.transaction_type='production_inbound' AND tx.product_id=d.product_id AND tx.batch_id=d.batch_id
   AND tx.quantity=d.inbound_number AND tx.unit_snapshot=d.unit_snapshot AND tx.stock_status=d.stock_status WHERE o.id=? AND o.source_type='finished_product' AND o.status='completed' ORDER BY d.id`,
    [id],
  );
  const order = group(rows)[0];
  if (!order) throw new ProductionDomainError('NOT_FOUND', '成品入库单不存在');
  return order;
}
function group(rows: Row[]): FinishedGoodsInboundOrderItem[] {
  const orders = new Map<string, FinishedGoodsInboundOrderItem>();
  for (const row of rows) {
    const id = String(row.inbound_id);
    let order = orders.get(id);
    if (!order) {
      order = {
        inboundId: id,
        inboundNo: row.inbound_no,
        status: 'completed',
        productionBatchId: String(row.production_batch_id),
        batchNo: row.batch_no,
        workOrderId: String(row.work_order_id),
        workOrderNo: row.work_order_no,
        productId: String(row.product_id),
        productCode: row.product_code,
        productName: row.product_name,
        unit: row.unit,
        inboundQuantity: '0',
        details: [],
        createdById: String(row.created_by),
        createdByName: String(row.created_by),
        createdAt: toBeijingISOString(row.created_at),
        inboundAt: toBeijingISOString(row.inbound_at),
        remark: row.remark,
      };
      orders.set(id, order);
    }
    const line: FinishedGoodsInboundOrderLine = {
      inboundDetailId: String(row.detail_id),
      allocationId: String(row.allocation_id),
      outputRevisionId: String(row.revision_id),
      revisionNo: row.revision_no,
      sourceType: row.category,
      quantity: String(row.quantity),
      itemBatchId: String(row.batch_id),
      batchCode: row.batch_code,
      inventoryTransactionId: String(row.transaction_id),
    };
    order.details.push(line);
    order.inboundQuantity = String(Number(order.inboundQuantity) + Number(row.quantity));
  }
  return [...orders.values()];
}
