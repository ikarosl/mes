import { Inject, Injectable } from '@nestjs/common';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import type {
  PageResult,
  ProductionTraceBatchSummary,
  ProductionTraceInventoryTransaction,
  ProductionTraceQuery,
  ProductionTraceWorkOrderGroup,
} from '@company/contracts';
import { toBeijingISOString } from '../../../common/time/beijing-time.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { ProductionTraceRepository } from '../application/ports/production-trace.repository.js';
import { ProductionDomainError } from '../domain/production.errors.js';

type TraceSummaryRow = RowDataPacket & {
  production_batch_id: number;
  batch_no: string;
  batch_status: ProductionTraceBatchSummary['batchStatus'];
  work_order_id: number;
  work_order_no: string;
  product_id: number;
  product_code: string;
  product_name: string;
  planned_quantity: string;
  completed_quantity: string;
  started_at: Date | null;
  completed_at: Date | null;
};

type TraceInventoryRow = RowDataPacket & {
  transaction_id: number;
  outbound_detail_id: number;
  item_id: number;
  item_code: string;
  item_name: string;
  item_batch_id: number;
  batch_code: string;
  quantity: string;
  unit_snapshot: string;
  created_at: Date;
};

const SUMMARY_SELECT = `SELECT b.id production_batch_id,b.batch_no,b.status batch_status,
  wo.id work_order_id,wo.work_order_no,b.product_id,wo.product_code_snapshot product_code,
  wo.product_name_snapshot product_name,b.planned_quantity,b.completed_quantity,b.started_at,b.completed_at
  FROM production_batches b JOIN work_orders wo ON wo.id=b.work_order_id`;

@Injectable()
export class MysqlProductionTraceRepository extends ProductionTraceRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {
    super();
  }

  async search(query: ProductionTraceQuery): Promise<PageResult<ProductionTraceWorkOrderGroup>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const conditions = ['1=1'];
    const values: Array<string | number> = [];
    if (query.keyword?.trim()) {
      const keyword = `%${query.keyword.trim()}%`;
      conditions.push(`(b.batch_no LIKE ? OR wo.work_order_no LIKE ? OR
        wo.product_code_snapshot LIKE ? OR wo.product_name_snapshot LIKE ? OR
        EXISTS (SELECT 1 FROM production_item_allocation a JOIN item_batch ib ON ib.id=a.batch_id
          WHERE a.production_batch_id=b.id AND
            (ib.item_code_snapshot LIKE ? OR ib.product_name_snapshot LIKE ? OR ib.batch_code LIKE ?)))`);
      values.push(keyword, keyword, keyword, keyword, keyword, keyword, keyword);
    }
    const where = conditions.join(' AND ');
    const [[count]] = await this.pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(DISTINCT b.work_order_id) total FROM production_batches b JOIN work_orders wo ON wo.id=b.work_order_id WHERE ${where}`,
      values,
    );
    const [workOrders] = await this.pool.query<(RowDataPacket & { work_order_id: number })[]>(
      `SELECT b.work_order_id FROM production_batches b JOIN work_orders wo ON wo.id=b.work_order_id
       WHERE ${where} GROUP BY b.work_order_id
       ORDER BY MAX(b.created_at) DESC,b.work_order_id DESC LIMIT ? OFFSET ?`,
      [...values, pageSize, (page - 1) * pageSize],
    );
    if (workOrders.length === 0)
      return { items: [], total: Number(count?.total ?? 0), page, pageSize };
    const [rows] = await this.pool.query<TraceSummaryRow[]>(
      `${SUMMARY_SELECT} WHERE b.work_order_id IN (${workOrders.map(() => '?').join(',')})
       ORDER BY b.work_order_id,b.created_at,b.id`,
      workOrders.map((row) => row.work_order_id),
    );
    const groups = new Map<string, ProductionTraceWorkOrderGroup>();
    for (const row of rows) {
      const summary = mapSummary(row);
      const key = summary.workOrderId;
      const group = groups.get(key) ?? {
        workOrderId: key,
        workOrderNo: summary.workOrderNo,
        productId: summary.productId,
        productCode: summary.productCode,
        productName: summary.productName,
        batches: [],
      };
      group.batches.push(summary);
      groups.set(key, group);
    }
    const items = workOrders.flatMap((row) => {
      const group = groups.get(String(row.work_order_id));
      return group ? [group] : [];
    });
    return { items, total: Number(count?.total ?? 0), page, pageSize };
  }

  async getSummary(batchId: string): Promise<ProductionTraceBatchSummary> {
    const [rows] = await this.pool.query<TraceSummaryRow[]>(
      `${SUMMARY_SELECT} WHERE b.id=? LIMIT 1`,
      [batchId],
    );
    if (!rows[0]) throw new ProductionDomainError('NOT_FOUND', '生产追溯批次不存在');
    return mapSummary(rows[0]);
  }

  async listInventoryTransactions(batchId: string): Promise<ProductionTraceInventoryTransaction[]> {
    const [rows] = await this.pool.query<TraceInventoryRow[]>(
      `SELECT tx.id transaction_id,tx.reference_detail_id outbound_detail_id,tx.item_id,
        ib.item_code_snapshot item_code,ib.product_name_snapshot item_name,tx.batch_id item_batch_id,ib.batch_code,
        tx.quantity,tx.unit_snapshot,tx.created_at
       FROM outbound_order o
       JOIN outbound_detail od ON od.outbound_id=o.id
       JOIN inventory_transaction tx ON tx.reference_type='outbound_detail'
         AND tx.reference_detail_id=od.id AND tx.transaction_type='production_material_outbound'
       JOIN item_batch ib ON ib.id=tx.batch_id
       WHERE o.production_batch_id=?
       ORDER BY tx.created_at,tx.id`,
      [batchId],
    );
    return rows.map((row) => ({
      transactionId: String(row.transaction_id),
      outboundDetailId: String(row.outbound_detail_id),
      itemId: String(row.item_id),
      itemCode: row.item_code,
      itemName: row.item_name,
      itemBatchId: String(row.item_batch_id),
      batchCode: row.batch_code,
      quantity: row.quantity,
      unit: row.unit_snapshot,
      transactionAt: toBeijingISOString(row.created_at),
    }));
  }

  async listMaterialInboundSources(batchId: string) {
    const [rows] = await this.pool.query<
      (RowDataPacket & {
        item_batch_id: number;
        batch_code: string;
        item_code: string;
        item_name: string;
        inbound_no: string | null;
        provider: string | null;
        confirmed_at: Date | null;
        quantity: string;
        transaction_id: number;
        reference_type: string;
      })[]
    >(
      `SELECT DISTINCT ib.id item_batch_id,ib.batch_code,ib.item_code_snapshot item_code,
        ib.product_name_snapshot item_name,o.inbound_no,o.provider,o.inbound_at confirmed_at,
        tx.quantity,tx.id transaction_id,tx.reference_type
       FROM production_item_allocation a JOIN item_batch ib ON ib.id=a.batch_id
       JOIN inventory_transaction tx ON tx.batch_id=ib.id AND tx.quantity>0
       LEFT JOIN inbound_detail d ON tx.reference_type='inbound_detail' AND tx.reference_detail_id=d.id
       LEFT JOIN inbound_order o ON o.id=d.inbound_id AND o.status='completed'
       WHERE a.production_batch_id=? AND tx.stock_status='available'
       ORDER BY ib.id,tx.id`,
      [batchId],
    );
    return rows.map((row) => ({
      itemBatchId: String(row.item_batch_id),
      batchCode: row.batch_code,
      itemCode: row.item_code,
      itemName: row.item_name,
      sourceLabel: row.inbound_no ? ('purchase_inbound' as const) : ('initial_stock' as const),
      inboundNo: row.inbound_no,
      provider: row.provider,
      confirmedAt: row.confirmed_at ? toBeijingISOString(row.confirmed_at) : null,
      inboundQuantity: row.quantity,
      inventoryTransactionId: String(row.transaction_id),
    }));
  }
}

const mapSummary = (row: TraceSummaryRow): ProductionTraceBatchSummary => ({
  productionBatchId: String(row.production_batch_id),
  batchNo: row.batch_no,
  batchStatus: row.batch_status,
  workOrderId: String(row.work_order_id),
  workOrderNo: row.work_order_no,
  productId: String(row.product_id),
  productCode: row.product_code,
  productName: row.product_name,
  plannedQuantity: row.planned_quantity,
  completedQuantity: row.completed_quantity,
  startedAt: row.started_at ? toBeijingISOString(row.started_at) : null,
  completedAt: row.completed_at ? toBeijingISOString(row.completed_at) : null,
});
