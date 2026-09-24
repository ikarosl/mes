import { MaterialVariantQuery } from '../../product/public.js';
import { currentMaterialNameSql } from './queries/material-name.sql.js';
import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import type {
  InventoryBatchItem,
  InventoryBatchQuery,
  PageResult,
  PurchaseInboundOrderItem,
  PurchaseInboundOrderQuery,
} from '@company/contracts';
import { toBeijingISOString } from '../../../common/time/date-time.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { InventoryInboundRepository } from '../application/ports/inventory-inbound.repository.js';
import { InventoryDomainError } from '../domain/inventory.errors.js';
import { getInventoryBatch, listInventoryBatches } from './queries/mysql-inventory-batch.query.js';
import { fixedIntegerQuantity, integerQuantity } from '@company/utils';

type OrderRow = RowDataPacket & {
  id: number;
  inbound_no: string;
  source_type: 'purchased';
  provider: string | null;
  status: 'pending' | 'completed' | 'cancelled';
  inbound_at: Date | null;
  operator_id: number | null;
  created_by: number | null;
  created_at: Date;
  version: number;
  remark: string | null;
  cancel_reason: string | null;
  cancelled_by: number | null;
  cancelled_at: Date | null;
};
type DetailRow = RowDataPacket & {
  id: number;
  inbound_id: number;
  item_id: number;
  material_variant_id: number;
  batch_id: number;
  item_code_snapshot: string;
  item_name: string;
  material_variant_code_snapshot: string;
  batch_code: string;
  inbound_number: string;
  unit_snapshot: string;
  stock_status: 'available';
  inventory_transaction_id: number | null;
  procurement_receipt_line_id: number | null;
  procurement_receipt_revision_id: number | null;
  procurement_inspection_id: number | null;
  procurement_allocation_id: number | null;
};
@Injectable()
export class MysqlInventoryInboundRepository extends InventoryInboundRepository {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly variants: MaterialVariantQuery,
  ) {
    super();
  }
  async list(query: PurchaseInboundOrderQuery): Promise<PageResult<PurchaseInboundOrderItem>> {
    const where = ["o.source_type='purchased'"];
    const params: Array<string | number | null> = [];
    if (query.keyword) {
      where.push('(o.inbound_no LIKE ? OR o.provider LIKE ?)');
      params.push(`%${query.keyword}%`, `%${query.keyword}%`);
    }
    if (query.status) {
      where.push('o.status=?');
      params.push(query.status);
    }
    const [[count]] = await this.pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total FROM inbound_order o WHERE ${where.join(' AND ')}`,
      params,
    );
    const page = query.page ?? 1,
      pageSize = query.pageSize ?? 20,
      offset = (page - 1) * pageSize;
    const [rows] = await this.pool.query<OrderRow[]>(
      `SELECT o.* FROM inbound_order o WHERE ${where.join(' AND ')} ORDER BY o.id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );
    const details = await this.loadDetailsForOrders(
      this.pool,
      rows.map((row) => String(row.id)),
    );
    return {
      items: rows.map((row) => this.mapOrder(row, details.get(String(row.id)) ?? [])),
      total: Number(count?.total ?? 0),
      page,
      pageSize,
    };
  }
  async get(id: string) {
    return this.loadOrder(this.pool, await this.findOrder(this.pool, id));
  }
  listInventory(query: InventoryBatchQuery): Promise<PageResult<InventoryBatchItem>> {
    return listInventoryBatches(this.pool, query, this.variants);
  }
  getInventory(id: string) {
    return getInventoryBatch(this.pool, id, this.variants);
  }
  private async findOrder(db: Pool | PoolConnection, id: string, lock = false) {
    const [rows] = await db.query<OrderRow[]>(
      `SELECT * FROM inbound_order WHERE id=? AND source_type='purchased'${lock ? ' FOR UPDATE' : ''}`,
      [id],
    );
    if (!rows[0]) throw new InventoryDomainError('NOT_FOUND', '外购物料入库单不存在');
    return rows[0];
  }
  private async loadDetails(db: Pool | PoolConnection, id: string, lock = false) {
    if (lock)
      await db.query('SELECT id FROM inbound_detail WHERE inbound_id=? ORDER BY id FOR UPDATE', [
        id,
      ]);
    const [rows] = await db.query<DetailRow[]>(
      `SELECT d.*,${currentMaterialNameSql('d.item_id')} item_name,ib.batch_code,ib.material_variant_code_snapshot,
       it.id inventory_transaction_id
       FROM inbound_detail d
       JOIN item_batch ib ON ib.id=d.batch_id
       LEFT JOIN inventory_transaction it ON it.reference_type='inbound_detail'
         AND it.reference_detail_id=d.id AND it.transaction_type='purchase_inbound'
       WHERE d.inbound_id=? AND d.product_id IS NULL ORDER BY d.id`,
      [id],
    );
    return rows;
  }
  private async loadDetailsForOrders(db: Pool | PoolConnection, ids: string[]) {
    const grouped = new Map<string, DetailRow[]>();
    if (ids.length === 0) return grouped;
    const [rows] = await db.query<DetailRow[]>(
      `SELECT d.*,${currentMaterialNameSql('d.item_id')} item_name,ib.batch_code,ib.material_variant_code_snapshot,
       it.id inventory_transaction_id
       FROM inbound_detail d
       JOIN item_batch ib ON ib.id=d.batch_id
       LEFT JOIN inventory_transaction it ON it.reference_type='inbound_detail'
         AND it.reference_detail_id=d.id AND it.transaction_type='purchase_inbound'
       WHERE d.product_id IS NULL AND d.inbound_id IN (${ids.map(() => '?').join(',')})
       ORDER BY d.inbound_id,d.id`,
      ids,
    );
    for (const row of rows) {
      const key = String(row.inbound_id);
      const values = grouped.get(key) ?? [];
      values.push(row);
      grouped.set(key, values);
    }
    return grouped;
  }
  private async loadOrder(
    db: Pool | PoolConnection,
    row: OrderRow,
  ): Promise<PurchaseInboundOrderItem> {
    const details = await this.loadDetails(db, String(row.id));
    return this.mapOrder(row, details);
  }
  private mapOrder(row: OrderRow, details: DetailRow[]): PurchaseInboundOrderItem {
    const summary = new Map<string, number>();
    for (const x of details)
      summary.set(
        x.unit_snapshot,
        (summary.get(x.unit_snapshot) ?? 0) + integerQuantity(x.inbound_number),
      );
    return {
      inboundId: String(row.id),
      inboundNo: row.inbound_no,
      sourceType: 'purchased',
      provider: row.provider,
      status: row.status,
      inboundAt: iso(row.inbound_at),
      operatorId: row.operator_id === null ? null : String(row.operator_id),
      operatorName: null,
      createdById: row.created_by === null ? null : String(row.created_by),
      createdByName: null,
      createdAt: toBeijingISOString(row.created_at),
      version: row.version,
      remark: row.remark,
      cancelReason: row.cancel_reason,
      cancelledById: row.cancelled_by === null ? null : String(row.cancelled_by),
      cancelledByName: null,
      cancelledAt: iso(row.cancelled_at),
      detailCount: details.length,
      totalInboundQuantity: decimal(
        details.reduce((n, x) => n + integerQuantity(x.inbound_number), 0),
      ),
      quantitySummary: [...summary].map(([unit, quantity]) => ({
        unit,
        quantity: decimal(quantity),
      })),
      details: details.map((x) => ({
        id: String(x.id),
        itemId: String(x.item_id),
        materialVariantId: String(x.material_variant_id),
        materialVariantCode: x.material_variant_code_snapshot,
        itemCode: x.item_code_snapshot,
        itemName: x.item_name,
        itemBatchId: String(x.batch_id),
        batchCode: x.batch_code,
        inboundQuantity: String(x.inbound_number),
        unit: x.unit_snapshot,
        stockStatus: 'available',
        inventoryTransactionId:
          x.inventory_transaction_id === null ? null : String(x.inventory_transaction_id),
        procurementReceiptLineId: idOrNull(x.procurement_receipt_line_id),
        procurementReceiptRevisionId: idOrNull(x.procurement_receipt_revision_id),
        procurementInspectionId: idOrNull(x.procurement_inspection_id),
        procurementAllocationId: idOrNull(x.procurement_allocation_id),
      })),
    };
  }
}
const decimal = fixedIntegerQuantity;
const iso = (d: Date | null) => (d ? toBeijingISOString(d) : null);
const idOrNull = (id: number | null) => (id === null ? null : String(id));
