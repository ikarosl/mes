import { InventoryStockCommand } from '../application/inventory-stock.command.js';
import { currentMaterialNameSql } from './queries/material-name.sql.js';
import { Inject, Injectable } from '@nestjs/common';
import { withTransaction } from '@company/database';
import type {
  CreateStockCheckPayload,
  PageResult,
  SaveStockCheckCountsPayload,
  StockCheckCandidateItem,
  StockCheckCandidateQuery,
  StockCheckOrderItem,
  StockCheckOrderQuery,
  StockStatus,
} from '@company/contracts';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { toBeijingISOString } from '../../../common/time/date-time.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { InventoryDomainError } from '../domain/inventory.errors.js';
import { integerQuantity } from '@company/utils';
import { InventoryStockCheckRepository } from '../application/ports/inventory-stock-check.repository.js';
import {
  pagination,
  placeholders,
  numericSort,
  decimal,
  iso,
  businessNo,
  requireVersion,
  requireAffected,
  groupBy,
  writeInventoryAudit,
} from './mysql-inventory.shared.js';

type Executor = Pool | PoolConnection;

type StockCheckOrderRow = RowDataPacket & {
  id: number;
  check_no: string;
  status: StockCheckOrderItem['status'];
  check_at: Date | null;
  operator_id: number | null;
  created_by: number;
  created_at: Date;
  version: number;
  remark: string | null;
  cancel_reason: string | null;
  cancelled_by: number | null;
  cancelled_at: Date | null;
};

type StockCheckDetailRow = RowDataPacket & {
  id: number;
  item_id: number;
  material_variant_id: number;
  batch_id: number;
  item_code_snapshot: string;
  item_name: string;
  material_variant_code_snapshot: string;
  batch_code: string;
  stock_status: StockStatus;
  unit_snapshot: string;
  system_quantity: string;
  actual_quantity: string | null;
  difference_quantity: string | null;
  result: StockCheckOrderItem['details'][number]['result'];
  adjusted: number;
  remark: string | null;
};

type StockCandidateRow = RowDataPacket & {
  item_id: number;
  material_variant_id: number;
  batch_id: number;
  item_code_snapshot: string;
  item_name: string;
  material_variant_code_snapshot: string;
  batch_code: string;
  stock_status: StockStatus;
  unit_snapshot: string;
  system_quantity: string;
};

const STOCK_CHECK_ORDER_SELECT = `SELECT so.id,so.check_no,so.status,so.check_at,
  so.operator_id,so.created_by,so.created_at,so.version,so.remark,
  so.cancel_reason,so.cancelled_by,so.cancelled_at
 FROM stock_check_order so`;

@Injectable()
export class MysqlInventoryStockCheckRepository extends InventoryStockCheckRepository {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly inventory: InventoryStockCommand,
  ) {
    super();
  }

  async listStockChecks(query: StockCheckOrderQuery): Promise<PageResult<StockCheckOrderItem>> {
    const where: string[] = [];
    const params: Array<string | number> = [];
    if (query.keyword) {
      where.push('so.check_no LIKE ?');
      params.push(`%${query.keyword}%`);
    }
    if (query.status) {
      where.push('so.status=?');
      params.push(query.status);
    }
    const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const [[count]] = await this.pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total FROM stock_check_order so${clause}`,
      params,
    );
    const { page, pageSize, offset } = pagination(query);
    const [rows] = await this.pool.query<StockCheckOrderRow[]>(
      `${STOCK_CHECK_ORDER_SELECT}${clause} ORDER BY so.id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );
    return {
      items: await this.mapStockChecks(this.pool, rows),
      total: Number(count?.total ?? 0),
      page,
      pageSize,
    };
  }

  async getStockCheck(stockCheckId: string): Promise<StockCheckOrderItem> {
    return this.loadStockCheck(this.pool, stockCheckId);
  }

  async listStockCheckCandidates(
    query: StockCheckCandidateQuery,
  ): Promise<PageResult<StockCheckCandidateItem>> {
    const where: string[] = ['ib.product_id IS NULL'];
    const params: Array<string | number> = [];
    if (query.keyword) {
      where.push(
        `(ib.item_code_snapshot LIKE ? OR ${currentMaterialNameSql('ib.item_id')} LIKE ? OR ib.batch_code LIKE ?)`,
      );
      params.push(...Array(3).fill(`%${query.keyword}%`));
    }
    if (query.stockStatus) {
      where.push('it.stock_status=?');
      params.push(query.stockStatus);
    }
    const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const base = `FROM item_batch ib JOIN inventory_transaction it
      ON it.batch_id=ib.id AND it.item_id=ib.item_id AND it.material_variant_id=ib.material_variant_id${clause}
      GROUP BY ib.id,it.stock_status HAVING SUM(it.quantity)>0`;
    const [[count]] = await this.pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total FROM (SELECT ib.id ${base}) candidates`,
      params,
    );
    const { page, pageSize, offset } = pagination(query);
    const [rows] = await this.pool.query<StockCandidateRow[]>(
      `SELECT ib.item_id,ib.material_variant_id,ib.id batch_id,ib.item_code_snapshot,${currentMaterialNameSql('ib.item_id')} item_name,
       ib.material_variant_code_snapshot,ib.batch_code,it.stock_status,ib.unit_snapshot,SUM(it.quantity) system_quantity
       ${base} ORDER BY ib.id DESC,it.stock_status LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );
    return {
      items: rows.map(mapStockCandidate),
      total: Number(count?.total ?? 0),
      page,
      pageSize,
    };
  }

  async createStockCheck(payload: CreateStockCheckPayload, context: CommandContext) {
    return withTransaction(this.pool, async (db) => {
      const batchIds = [...new Set(payload.details.map((line) => line.itemBatchId))].sort(
        numericSort,
      );
      await this.inventory.lockMaterialBatches(batchIds);
      const checkNo = payload.checkNo || businessNo('PD');
      let created: ResultSetHeader;
      try {
        [created] = await db.execute<ResultSetHeader>(
          `INSERT INTO stock_check_order
           (check_no,status,remark,created_by,updated_by) VALUES (?,'pending',?,?,?)`,
          [checkNo, payload.remark ?? null, context.actorId, context.actorId],
        );
      } catch (error) {
        if (isDuplicate(error))
          throw new InventoryDomainError('CONFLICT', '盘点单号已存在，请更换后重试');
        throw error;
      }
      const stockCheckId = String(created.insertId);
      for (const line of payload.details) {
        const [[target]] = await db.query<
          (RowDataPacket & {
            item_id: number;
            material_variant_id: number;
            unit_snapshot: string;
            system_quantity: string;
          })[]
        >(
          `SELECT ib.item_id,ib.material_variant_id,ib.unit_snapshot,COALESCE(SUM(it.quantity),0) system_quantity
           FROM item_batch ib LEFT JOIN inventory_transaction it
             ON it.batch_id=ib.id AND it.item_id=ib.item_id AND it.material_variant_id=ib.material_variant_id AND it.stock_status=?
           WHERE ib.id=? AND ib.product_id IS NULL GROUP BY ib.id`,
          [line.stockStatus, line.itemBatchId],
        );
        if (!target) throw new InventoryDomainError('NOT_FOUND', '库存批次不存在');
        target.system_quantity = await this.inventory.materialQuantity(
          line.itemBatchId,
          line.stockStatus,
        );
        if (integerQuantity(target.system_quantity) <= 0)
          throw new InventoryDomainError('CONFLICT', '所选库存批次或状态已无正库存，请刷新后重试');
        await db.execute(
          `INSERT INTO stock_check_detail
           (stock_check_id,item_id,material_variant_id,batch_id,stock_status,unit_snapshot,system_quantity,created_by)
           VALUES (?,?,?,?,?,?,?,?)`,
          [
            stockCheckId,
            target.item_id,
            target.material_variant_id,
            line.itemBatchId,
            line.stockStatus,
            target.unit_snapshot,
            target.system_quantity,
            context.actorId,
          ],
        );
      }
      await writeInventoryAudit(
        db,
        context,
        'production-stock-check.create',
        'stock_check_order',
        stockCheckId,
        null,
        { checkNo, status: 'pending', detailCount: payload.details.length },
      );
      return this.loadStockCheck(db, stockCheckId);
    });
  }

  async saveStockCheckCounts(
    stockCheckId: string,
    payload: SaveStockCheckCountsPayload,
    context: CommandContext,
  ) {
    return withTransaction(this.pool, async (db) => {
      const order = await this.findStockCheck(db, stockCheckId, true);
      if (!['pending', 'counting'].includes(order.status))
        throw new InventoryDomainError(
          'STOCK_CHECK_COUNT_NOT_ALLOWED',
          '仅待盘点或盘点中的单据可以录入数量',
        );
      requireVersion(order.version, payload.version, '盘点单');
      const details = await this.findStockCheckDetails(db, [stockCheckId], true);
      const byId = new Map(details.map((line) => [String(line.id), line]));
      for (const line of payload.details) {
        if (!byId.has(line.detailId))
          throw new InventoryDomainError('NOT_FOUND', '盘点明细不存在或不属于当前盘点单');
        if (line.actualQuantity < 0)
          throw new InventoryDomainError('INVALID_INPUT', '盘点实盘数量不能小于零');
        await db.execute(
          'UPDATE stock_check_detail SET actual_quantity=?,remark=? WHERE id=? AND stock_check_id=?',
          [line.actualQuantity, line.remark ?? null, line.detailId, stockCheckId],
        );
      }
      const [updated] = await db.execute<ResultSetHeader>(
        `UPDATE stock_check_order SET status='counting',updated_by=?,version=version+1
         WHERE id=? AND status IN ('pending','counting') AND version=?`,
        [context.actorId, stockCheckId, payload.version],
      );
      requireAffected(updated, '盘点单');
      await writeInventoryAudit(
        db,
        context,
        'production-stock-check.count',
        'stock_check_order',
        stockCheckId,
        { status: order.status, version: payload.version },
        {
          status: 'counting',
          version: payload.version + 1,
          updatedDetailCount: payload.details.length,
        },
      );
      return this.loadStockCheck(db, stockCheckId);
    });
  }

  async completeStockCheck(stockCheckId: string, version: number, context: CommandContext) {
    return withTransaction(this.pool, async (db) => {
      const order = await this.findStockCheck(db, stockCheckId, true);
      if (order.status === 'completed') return this.loadStockCheck(db, stockCheckId, order);
      if (!['pending', 'counting'].includes(order.status))
        throw new InventoryDomainError(
          'STOCK_CHECK_COUNT_NOT_ALLOWED',
          '仅待盘点或盘点中的单据可以完成盘点',
        );
      requireVersion(order.version, version, '盘点单');
      const details = await this.findStockCheckDetails(db, [stockCheckId], true);
      if (details.some((line) => line.actual_quantity === null))
        throw new InventoryDomainError('STOCK_CHECK_INCOMPLETE', '请先录入全部明细的实盘数量');
      await this.inventory.lockMaterialBatches(
        [...new Set(details.map((line) => String(line.batch_id)))].sort(numericSort),
      );
      for (const line of details) {
        const currentQuantity = await this.inventory.materialQuantity(
          String(line.batch_id),
          line.stock_status,
        );
        if (integerQuantity(currentQuantity) !== integerQuantity(line.system_quantity)) {
          throw new InventoryDomainError(
            'STOCK_CHECK_SNAPSHOT_CHANGED',
            '盘点期间库存已变化，本单不能完成，请取消后重新创建盘点单',
          );
        }
      }
      for (const line of details) {
        const difference =
          integerQuantity(line.actual_quantity!) - integerQuantity(line.system_quantity);
        if (difference !== 0) {
          await db.execute(
            `INSERT INTO inventory_transaction
             (item_id,material_variant_id,batch_id,transaction_type,quantity,unit_snapshot,stock_status,
              reference_type,reference_detail_id,idempotency_key,transaction_group_key,remark,created_by)
             VALUES (?,?,?,'stock_check_adjustment',?,?,?,'stock_check_detail',?,?,?,?,?)`,
            [
              line.item_id,
              line.material_variant_id,
              line.batch_id,
              decimal(difference),
              line.unit_snapshot,
              line.stock_status,
              line.id,
              `STOCKCHECK:${line.id}`,
              `STOCKCHECK:${stockCheckId}`,
              line.remark,
              context.actorId,
            ],
          );
        }
      }
      await db.execute('UPDATE stock_check_detail SET adjusted=1 WHERE stock_check_id=?', [
        stockCheckId,
      ]);
      const [updated] = await db.execute<ResultSetHeader>(
        `UPDATE stock_check_order SET status='completed',check_at=CURRENT_TIMESTAMP,
         operator_id=?,updated_by=?,version=version+1
         WHERE id=? AND status IN ('pending','counting') AND version=?`,
        [context.actorId, context.actorId, stockCheckId, version],
      );
      requireAffected(updated, '盘点单');
      await writeInventoryAudit(
        db,
        context,
        'production-stock-check.complete',
        'stock_check_order',
        stockCheckId,
        { status: order.status, version },
        { status: 'completed', version: version + 1 },
      );
      return this.loadStockCheck(db, stockCheckId);
    });
  }

  async cancelStockCheck(
    stockCheckId: string,
    version: number,
    reason: string,
    context: CommandContext,
  ) {
    return withTransaction(this.pool, async (db) => {
      const order = await this.findStockCheck(db, stockCheckId, true);
      if (order.status === 'cancelled') return this.loadStockCheck(db, stockCheckId, order);
      if (!['pending', 'counting'].includes(order.status))
        throw new InventoryDomainError(
          'STOCK_CHECK_CANCEL_NOT_ALLOWED',
          '仅待盘点或盘点中的单据可以取消',
        );
      requireVersion(order.version, version, '盘点单');
      const [updated] = await db.execute<ResultSetHeader>(
        `UPDATE stock_check_order SET status='cancelled',cancel_reason=?,cancelled_by=?,cancelled_at=NOW(),updated_by=?,version=version+1
         WHERE id=? AND status IN ('pending','counting') AND version=?`,
        [reason, context.actorId, context.actorId, stockCheckId, version],
      );
      requireAffected(updated, '盘点单');
      await writeInventoryAudit(
        db,
        context,
        'production-stock-check.cancel',
        'stock_check_order',
        stockCheckId,
        { status: order.status, version },
        { status: 'cancelled', reason, version: version + 1 },
      );
      return this.loadStockCheck(db, stockCheckId);
    });
  }

  private async findStockCheck(db: Executor, id: string, lock = false) {
    const [[row]] = await db.query<StockCheckOrderRow[]>(
      `${STOCK_CHECK_ORDER_SELECT} WHERE so.id=?${lock ? ' FOR UPDATE' : ''}`,
      [id],
    );
    if (!row) throw new InventoryDomainError('NOT_FOUND', '盘点单不存在');
    return row;
  }

  private async findStockCheckDetails(db: Executor, orderIds: string[], lock = false) {
    if (!orderIds.length) return [];
    const [rows] = await db.query<StockCheckDetailRow[]>(
      `SELECT sd.id,sd.stock_check_id,sd.item_id,sd.material_variant_id,sd.batch_id,NULL item_code_snapshot,
       NULL item_name,NULL material_variant_code_snapshot,NULL batch_code,sd.stock_status,sd.unit_snapshot,
       sd.system_quantity,sd.actual_quantity,sd.difference_quantity,sd.result,sd.adjusted,sd.remark
       FROM stock_check_detail sd
       WHERE sd.stock_check_id IN (${placeholders(orderIds)})
       ORDER BY sd.stock_check_id,sd.id${lock ? ' FOR UPDATE' : ''}`,
      orderIds,
    );
    const batches = new Map(
      (
        await this.inventory.materialBatchReferences([
          ...new Set(rows.map((row) => String(row.batch_id))),
        ])
      ).map((row) => [row.id, row]),
    );
    for (const row of rows) {
      const batch = batches.get(String(row.batch_id));
      if (!batch) throw new InventoryDomainError('NOT_FOUND', '库存批次不存在');
      row.item_code_snapshot = batch.itemCode;
      row.item_name = batch.itemName;
      row.material_variant_code_snapshot = batch.materialVariantCode;
      row.batch_code = batch.batchCode;
    }
    return rows;
  }

  private async mapStockChecks(db: Executor, rows: StockCheckOrderRow[]) {
    if (!rows.length) return [];
    const [details] = await db.query<(StockCheckDetailRow & { stock_check_id: number })[]>(
      `SELECT sd.id,sd.stock_check_id,sd.item_id,sd.material_variant_id,sd.batch_id,ib.item_code_snapshot,
       ${currentMaterialNameSql('ib.item_id')} item_name,ib.material_variant_code_snapshot,ib.batch_code,sd.stock_status,sd.unit_snapshot,
       sd.system_quantity,sd.actual_quantity,sd.difference_quantity,sd.result,sd.adjusted,sd.remark
       FROM stock_check_detail sd JOIN item_batch ib ON ib.id=sd.batch_id
       WHERE sd.stock_check_id IN (${placeholders(rows)}) ORDER BY sd.stock_check_id,sd.id`,
      rows.map((row) => row.id),
    );
    const grouped = groupBy(details, (line) => String(line.stock_check_id));
    return rows.map((row) => mapStockCheck(row, grouped.get(String(row.id)) ?? []));
  }

  private async loadStockCheck(db: Executor, id: string, known?: StockCheckOrderRow) {
    const row = known ?? (await this.findStockCheck(db, id));
    const details = await this.findStockCheckDetails(db, [id]);
    return mapStockCheck(row, details);
  }
}

const mapStockCandidate = (row: StockCandidateRow): StockCheckCandidateItem => ({
  itemId: String(row.item_id),
  materialVariantId: String(row.material_variant_id),
  materialVariantCode: row.material_variant_code_snapshot,
  itemCode: row.item_code_snapshot,
  itemName: row.item_name,
  itemBatchId: String(row.batch_id),
  batchCode: row.batch_code,
  stockStatus: row.stock_status,
  systemQuantity: String(row.system_quantity),
  unit: row.unit_snapshot,
});

const mapStockCheck = (
  row: StockCheckOrderRow,
  details: StockCheckDetailRow[],
): StockCheckOrderItem => ({
  id: String(row.id),
  checkNo: row.check_no,
  status: row.status,
  checkAt: iso(row.check_at),
  operatorId: row.operator_id === null ? null : String(row.operator_id),
  operatorName: null,
  createdById: String(row.created_by),
  createdByName: null,
  createdAt: toBeijingISOString(row.created_at),
  version: row.version,
  remark: row.remark,
  cancelReason: row.cancel_reason,
  cancelledById: row.cancelled_by === null ? null : String(row.cancelled_by),
  cancelledByName: null,
  cancelledAt: iso(row.cancelled_at),
  detailCount: details.length,
  pendingCount: details.filter((line) => line.actual_quantity === null).length,
  differenceCount: details.filter((line) => line.result === 'surplus' || line.result === 'shortage')
    .length,
  details: details.map((line) => ({
    id: String(line.id),
    itemId: String(line.item_id),
    materialVariantId: String(line.material_variant_id),
    materialVariantCode: line.material_variant_code_snapshot,
    itemCode: line.item_code_snapshot,
    itemName: line.item_name,
    itemBatchId: String(line.batch_id),
    batchCode: line.batch_code,
    stockStatus: line.stock_status,
    unit: line.unit_snapshot,
    systemQuantity: String(line.system_quantity),
    actualQuantity: line.actual_quantity === null ? null : String(line.actual_quantity),
    differenceQuantity: line.difference_quantity === null ? null : String(line.difference_quantity),
    result: line.result,
    adjusted: line.adjusted === 1,
    remark: line.remark,
  })),
});

const isDuplicate = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code?: string }).code === 'ER_DUP_ENTRY';
