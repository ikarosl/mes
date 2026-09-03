import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { withTransaction } from '@company/database';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  CreatePurchaseInboundPayload,
  InventoryBatchDetailItem,
  InventoryBatchItem,
  InventoryBatchTransactionItem,
  InventoryBatchQuery,
  PageResult,
  PurchaseInboundOrderItem,
  PurchaseInboundOrderQuery,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import { toBeijingISOString } from '../../../common/time/date-time.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import {
  ProductionInboundRepository,
  type PurchaseInboundItemSnapshot,
} from '../application/ports/production-inbound.repository.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { fixedIntegerQuantity, integerQuantity } from '../domain/integer-quantity.js';

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
  batch_id: number;
  item_code_snapshot: string;
  product_name_snapshot: string;
  batch_code: string;
  inbound_number: string;
  unit_snapshot: string;
  stock_status: 'available';
  inventory_transaction_id: number | null;
};
type InventoryRow = RowDataPacket & {
  id: number;
  item_id: number;
  item_code_snapshot: string;
  product_name_snapshot: string;
  unit_snapshot: string;
  batch_code: string;
  source_type: InventoryBatchItem['sourceType'];
  provider: string | null;
  batch_status: InventoryBatchItem['batchStatus'];
  on_hand: string;
  reserved: string;
};
type InventorySourceRow = RowDataPacket & {
  batch_id: number;
  inbound_id: number;
  inbound_no: string;
  provider: string | null;
  inbound_at: Date;
  inbound_number: string;
  transaction_id: number;
};
type InventoryTransactionRow = RowDataPacket & {
  id: number;
  transaction_type: InventoryBatchTransactionItem['transactionType'];
  quantity: string;
  unit_snapshot: string;
  stock_status: InventoryBatchTransactionItem['stockStatus'];
  reference_type: InventoryBatchTransactionItem['referenceType'];
  reference_detail_id: number;
  transaction_group_key: string | null;
  reversal_of_transaction_id: number | null;
  remark: string | null;
  created_at: Date;
};

@Injectable()
export class MysqlProductionInboundRepository extends ProductionInboundRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {
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
  async create(
    payload: CreatePurchaseInboundPayload,
    snapshots: PurchaseInboundItemSnapshot[],
    context: CommandContext,
  ) {
    return withTransaction(this.pool, async (db) => {
      const seen = new Set<string>();
      for (const line of payload.details) {
        const key = `${line.itemId}:${line.batchCode}`;
        if (!line.batchCode || seen.has(key) || line.inboundQuantity <= 0)
          throw new ProductionDomainError(
            'INVALID_INPUT',
            '入库明细存在空批次、重复物料批次或无效数量',
          );
        seen.add(key);
      }
      const byId = new Map(snapshots.map((x) => [x.id, x]));
      const inboundNo =
        payload.inboundNo ||
        `PI-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`;
      let result: ResultSetHeader;
      try {
        [result] = await db.execute<ResultSetHeader>(
          "INSERT INTO inbound_order(inbound_no,source_type,provider,status,remark,created_by,updated_by) VALUES(?,'purchased',?,'pending',?,?,?)",
          [
            inboundNo,
            payload.provider ?? null,
            payload.remark ?? null,
            context.actorId,
            context.actorId,
          ],
        );
      } catch (error) {
        if (isDuplicate(error)) throw new ProductionDomainError('CONFLICT', '入库单号已存在');
        throw error;
      }
      const inboundId = String(result.insertId);
      for (const line of payload.details) {
        const snapshot = byId.get(line.itemId);
        if (!snapshot) throw new ProductionDomainError('NOT_FOUND', '入库物料不存在');
        await db.execute(
          "INSERT INTO item_batch(item_id,item_code_snapshot,product_name_snapshot,unit_snapshot,batch_code,source_type,provider,batch_status,remark,created_by,updated_by) VALUES(?,?,?,?,?,'purchased',?,'available',?,?,?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)",
          [
            line.itemId,
            snapshot.itemCode,
            snapshot.productName,
            snapshot.unit,
            line.batchCode,
            payload.provider ?? null,
            line.remark ?? null,
            context.actorId,
            context.actorId,
          ],
        );
        const [[batch]] = await db.query<(RowDataPacket & { id: number })[]>(
          'SELECT id FROM item_batch WHERE item_id=? AND batch_code=?',
          [line.itemId, line.batchCode],
        );
        await db.execute(
          "INSERT INTO inbound_detail(inbound_id,item_id,batch_id,item_code_snapshot,product_name_snapshot,inbound_number,unit_snapshot,stock_status,remark,created_by) VALUES(?,?,?,?,?,? ,?,'available',?,?)",
          [
            inboundId,
            line.itemId,
            batch!.id,
            snapshot.itemCode,
            snapshot.productName,
            line.inboundQuantity,
            snapshot.unit,
            line.remark ?? null,
            context.actorId,
          ],
        );
      }
      await this.audit(db, context, 'production-inbound.create', inboundId, null, {
        inboundNo,
        status: 'pending',
        detailCount: payload.details.length,
      });
      return this.loadOrder(db, await this.findOrder(db, inboundId));
    });
  }
  async confirm(id: string, version: number, context: CommandContext) {
    return withTransaction(this.pool, async (db) => {
      const order = await this.findOrder(db, id, true);
      if (order.status === 'completed') return this.loadOrder(db, order);
      if (order.status !== 'pending')
        throw new ProductionDomainError('INBOUND_CONFIRM_NOT_ALLOWED', '仅待确认入库单可以确认');
      if (order.version !== version)
        throw new ProductionDomainError('CONCURRENT_MODIFICATION', '入库单版本已变化');
      const details = await this.loadDetails(db, id, true);
      const batchIds = [...new Set(details.map((x) => String(x.batch_id)))].sort(
        (a, b) => Number(a) - Number(b),
      );
      if (batchIds.length)
        await db.query(
          `SELECT id FROM item_batch WHERE id IN (${batchIds.map(() => '?').join(',')}) ORDER BY id FOR UPDATE`,
          batchIds,
        );
      for (const line of details)
        await db.execute(
          "INSERT INTO inventory_transaction(item_id,batch_id,transaction_type,quantity,unit_snapshot,stock_status,reference_type,reference_detail_id,idempotency_key,remark,created_by) VALUES(?,?,'purchase_inbound',?,?,'available','inbound_detail',?,?,?,?)",
          [
            line.item_id,
            line.batch_id,
            line.inbound_number,
            line.unit_snapshot,
            line.id,
            `PI:${id}:${line.id}`,
            order.remark,
            context.actorId,
          ],
        );
      const [updated] = await db.execute<ResultSetHeader>(
        "UPDATE inbound_order SET status='completed',inbound_at=CURRENT_TIMESTAMP,operator_id=?,updated_by=?,version=version+1 WHERE id=? AND status='pending' AND version=?",
        [context.actorId, context.actorId, id, version],
      );
      if (updated.affectedRows !== 1)
        throw new ProductionDomainError('CONCURRENT_MODIFICATION', '入库单已被其他操作修改');
      await this.audit(
        db,
        context,
        'production-inbound.confirm',
        id,
        { status: 'pending', version },
        { status: 'completed', version: version + 1 },
      );
      return this.loadOrder(db, await this.findOrder(db, id));
    });
  }
  async cancel(id: string, version: number, reason: string, context: CommandContext) {
    return withTransaction(this.pool, async (db) => {
      const order = await this.findOrder(db, id, true);
      if (order.status === 'cancelled') return this.loadOrder(db, order);
      if (order.status !== 'pending')
        throw new ProductionDomainError('INBOUND_CANCEL_NOT_ALLOWED', '仅待确认入库单可以取消');
      if (order.version !== version)
        throw new ProductionDomainError('CONCURRENT_MODIFICATION', '入库单版本已变化');
      await db.execute(
        "UPDATE inbound_order SET status='cancelled',cancel_reason=?,cancelled_by=?,cancelled_at=NOW(),updated_by=?,version=version+1 WHERE id=? AND status='pending' AND version=?",
        [reason, context.actorId, context.actorId, id, version],
      );
      await this.audit(
        db,
        context,
        'production-inbound.cancel',
        id,
        { status: 'pending', version },
        { status: 'cancelled', reason, version: version + 1 },
      );
      return this.loadOrder(db, await this.findOrder(db, id));
    });
  }
  async listInventory(query: InventoryBatchQuery): Promise<PageResult<InventoryBatchItem>> {
    const where = [
      '1=1',
      // 库存列表只显示已产生真实库存流水的批次；待确认入库单会先创建 item_batch，
      // 但 inventory_transaction 仍为空，不能作为库存列表返回。
      'EXISTS (SELECT 1 FROM inventory_transaction it WHERE it.batch_id = ib.id)',
    ];
    const params: Array<string | number | null> = [];
    if (query.keyword) {
      where.push('(ib.item_code_snapshot LIKE ? OR ib.product_name_snapshot LIKE ?)');
      params.push(`%${query.keyword}%`, `%${query.keyword}%`);
    }
    if (query.batchCode) {
      where.push('ib.batch_code LIKE ?');
      params.push(`%${query.batchCode}%`);
    }
    if (query.batchStatus) {
      where.push('ib.batch_status=?');
      params.push(query.batchStatus);
    }
    const [[count]] = await this.pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total FROM item_batch ib WHERE ${where.join(' AND ')}`,
      params,
    );
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const [rows] = await this.pool.query<(RowDataPacket & { id: number })[]>(
      `SELECT ib.id FROM item_batch ib WHERE ${where.join(' AND ')} ORDER BY ib.id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize],
    );
    const items = await this.loadInventories(
      this.pool,
      rows.map((row) => String(row.id)),
    );
    return {
      items,
      total: Number(count?.total ?? 0),
      page,
      pageSize,
    };
  }
  getInventory(id: string) {
    return this.loadInventory(this.pool, id);
  }
  private async findOrder(db: Pool | PoolConnection, id: string, lock = false) {
    const [rows] = await db.query<OrderRow[]>(
      `SELECT * FROM inbound_order WHERE id=? AND source_type='purchased'${lock ? ' FOR UPDATE' : ''}`,
      [id],
    );
    if (!rows[0]) throw new ProductionDomainError('NOT_FOUND', '外购物料入库单不存在');
    return rows[0];
  }
  private async loadDetails(db: Pool | PoolConnection, id: string, lock = false) {
    const [rows] = await db.query<DetailRow[]>(
      `SELECT d.*,ib.batch_code,it.id inventory_transaction_id FROM inbound_detail d JOIN item_batch ib ON ib.id=d.batch_id LEFT JOIN inventory_transaction it ON it.reference_type='inbound_detail' AND it.reference_detail_id=d.id AND it.transaction_type='purchase_inbound' WHERE d.inbound_id=? ORDER BY d.id${lock ? ' FOR UPDATE' : ''}`,
      [id],
    );
    return rows;
  }
  private async loadDetailsForOrders(db: Pool | PoolConnection, ids: string[]) {
    const grouped = new Map<string, DetailRow[]>();
    if (ids.length === 0) return grouped;
    const [rows] = await db.query<DetailRow[]>(
      `SELECT d.*,ib.batch_code,it.id inventory_transaction_id
       FROM inbound_detail d
       JOIN item_batch ib ON ib.id=d.batch_id
       LEFT JOIN inventory_transaction it ON it.reference_type='inbound_detail'
         AND it.reference_detail_id=d.id AND it.transaction_type='purchase_inbound'
       WHERE d.inbound_id IN (${ids.map(() => '?').join(',')})
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
        itemCode: x.item_code_snapshot,
        itemName: x.product_name_snapshot,
        itemBatchId: String(x.batch_id),
        batchCode: x.batch_code,
        inboundQuantity: x.inbound_number,
        unit: x.unit_snapshot,
        stockStatus: 'available',
        inventoryTransactionId:
          x.inventory_transaction_id === null ? null : String(x.inventory_transaction_id),
      })),
    };
  }
  private async loadInventory(
    db: Pool | PoolConnection,
    id: string,
  ): Promise<InventoryBatchDetailItem> {
    const rows = await this.loadInventories(db, [id]);
    if (!rows[0]) throw new ProductionDomainError('NOT_FOUND', '库存批次不存在');
    const [transactions] = await db.query<InventoryTransactionRow[]>(
      `SELECT id,transaction_type,quantity,unit_snapshot,stock_status,reference_type,
       reference_detail_id,transaction_group_key,reversal_of_transaction_id,remark,created_at
       FROM inventory_transaction WHERE batch_id=? ORDER BY created_at DESC,id DESC`,
      [id],
    );
    return {
      ...rows[0],
      inventoryTransactions: transactions.map((transaction) => ({
        inventoryTransactionId: String(transaction.id),
        transactionType: transaction.transaction_type,
        quantity: transaction.quantity,
        unit: transaction.unit_snapshot,
        stockStatus: transaction.stock_status,
        referenceType: transaction.reference_type,
        referenceDetailId: String(transaction.reference_detail_id),
        transactionGroupKey: transaction.transaction_group_key,
        reversalOfInventoryTransactionId:
          transaction.reversal_of_transaction_id === null
            ? null
            : String(transaction.reversal_of_transaction_id),
        remark: transaction.remark,
        transactionAt: toBeijingISOString(transaction.created_at),
      })),
    };
  }
  private async loadInventories(
    db: Pool | PoolConnection,
    ids: string[],
  ): Promise<InventoryBatchItem[]> {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await db.query<InventoryRow[]>(
      `SELECT ib.*,COALESCE(MAX(balance.current_quantity),0) on_hand,
       COALESCE((SELECT SUM(GREATEST(a.assigned_number-COALESCE((SELECT SUM(od.outbound_number) FROM outbound_detail od JOIN outbound_order oo ON oo.id=od.outbound_id WHERE od.allocation_id=a.id AND oo.status='completed'),0),0)) FROM production_item_allocation a WHERE a.batch_id=ib.id AND a.allocation_status NOT IN ('released','cancelled')),0) reserved
       FROM item_batch ib LEFT JOIN inventory_batch_balance balance
         ON balance.batch_id=ib.id AND balance.stock_status='available'
       WHERE ib.id IN (${placeholders}) GROUP BY ib.id ORDER BY ib.id DESC`,
      ids,
    );
    const [sources] = await db.query<InventorySourceRow[]>(
      `SELECT d.batch_id,o.id inbound_id,o.inbound_no,o.provider,o.inbound_at,d.inbound_number,it.id transaction_id
       FROM inbound_detail d
       JOIN inbound_order o ON o.id=d.inbound_id AND o.status='completed'
       JOIN inventory_transaction it ON it.reference_type='inbound_detail' AND it.reference_detail_id=d.id
       WHERE d.batch_id IN (${placeholders}) ORDER BY d.batch_id,d.id`,
      ids,
    );
    const sourcesByBatch = new Map<string, InventorySourceRow[]>();
    for (const source of sources) {
      const key = String(source.batch_id);
      const values = sourcesByBatch.get(key) ?? [];
      values.push(source);
      sourcesByBatch.set(key, values);
    }
    return rows.map((row) => this.mapInventory(row, sourcesByBatch.get(String(row.id)) ?? []));
  }
  private mapInventory(row: InventoryRow, sources: InventorySourceRow[]): InventoryBatchItem {
    return {
      itemBatchId: String(row.id),
      itemId: String(row.item_id),
      itemCode: row.item_code_snapshot,
      itemName: row.product_name_snapshot,
      unit: row.unit_snapshot,
      batchCode: row.batch_code,
      sourceType: row.source_type,
      provider: row.provider,
      batchStatus: row.batch_status,
      onHandAvailableQuantity: row.on_hand,
      reservedQuantity: row.reserved,
      availableToAllocateQuantity: decimal(
        Math.max(0, integerQuantity(row.on_hand) - integerQuantity(row.reserved)),
      ),
      inboundSources: sources.map((x) => ({
        inboundId: String(x.inbound_id),
        inboundNo: x.inbound_no,
        provider: x.provider,
        inboundAt: toBeijingISOString(x.inbound_at),
        inboundQuantity: x.inbound_number,
        inventoryTransactionId: String(x.transaction_id),
      })),
    };
  }
  private audit(
    db: PoolConnection,
    context: CommandContext,
    action: string,
    id: string,
    beforeData: unknown,
    afterData: unknown,
  ) {
    return writeTransactionalAudit(db, {
      logType: 'business',
      module: 'production',
      action,
      userId: context.actorId,
      targetId: id,
      targetType: 'inbound_order',
      result: 'success',
      beforeData,
      afterData,
      requestId: context.requestId,
      ip: context.ip,
      userAgent: context.userAgent,
    });
  }
}
const decimal = fixedIntegerQuantity;
const iso = (d: Date | null) => (d ? toBeijingISOString(d) : null);
const isDuplicate = (e: unknown) =>
  typeof e === 'object' &&
  e !== null &&
  'code' in e &&
  (e as { code?: string }).code === 'ER_DUP_ENTRY';
