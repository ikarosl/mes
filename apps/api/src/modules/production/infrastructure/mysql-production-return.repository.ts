import { currentMaterialNameSql } from './queries/material-name.sql.js';
import { Inject, Injectable } from '@nestjs/common';
import { withTransaction } from '@company/database';
import type {
  CreateReturnOrderPayload,
  PageResult,
  ReturnOrderBatchOption,
  ReturnOrderCandidateItem,
  ReturnOrderItem,
  ReturnOrderQuery,
} from '@company/contracts';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { toBeijingISOString } from '../../../common/time/date-time.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { integerQuantity } from '../domain/integer-quantity.js';
import { findBatch } from './mysql-production.shared.js';
import { ProductionReturnRepository } from '../application/ports/production-return.repository.js';
import {
  pagination,
  placeholders,
  numericSort,
  decimal,
  iso,
  businessNo,
  requireVersion,
  requireAffected,
  lockIds,
  groupBy,
  writeInventoryAudit,
} from './mysql-production-inventory.shared.js';

type Executor = Pool | PoolConnection;

type ReturnOrderRow = RowDataPacket & {
  id: number;
  return_no: string;
  production_batch_id: number;
  batch_no: string;
  work_order_id: number;
  work_order_no: string;
  product_code: string;
  product_name: string;
  status: ReturnOrderItem['status'];
  return_at: Date | null;
  operator_id: number | null;
  created_by: number;
  created_at: Date;
  version: number;
  remark: string | null;
  cancel_reason: string | null;
  cancelled_by: number | null;
  cancelled_at: Date | null;
};

type ReturnDetailRow = RowDataPacket & {
  id: number;
  return_id: number;
  allocation_id: number;
  demand_id: number;
  item_id: number;
  material_variant_id: number;
  batch_id: number;
  item_code_snapshot: string;
  item_name: string;
  material_variant_code_snapshot: string;
  batch_code: string;
  return_number: string;
  unit_snapshot: string;
  return_stock_status: 'available';
  release_after_return: number;
  inventory_transaction_id: number | null;
  remark: string | null;
};

type ReturnCandidateRow = RowDataPacket & {
  allocation_id: number;
  demand_id: number;
  production_batch_id: number;
  item_id: number;
  material_variant_id: number;
  batch_id: number;
  item_code_snapshot: string;
  item_name: string;
  material_variant_code_snapshot: string;
  batch_code: string;
  unit_snapshot: string;
  confirmed_quantity: string;
  occupied_quantity: string;
  occupied_loss_quantity: string;
};

const RETURN_ORDER_SELECT = `SELECT ro.id,ro.return_no,ro.production_batch_id,pb.batch_no,
  ro.work_order_id,wo.work_order_no,wo.product_code_snapshot product_code,
  wo.product_name_snapshot product_name,ro.status,ro.return_at,ro.operator_id,
  ro.created_by,ro.created_at,ro.version,ro.remark,ro.cancel_reason,ro.cancelled_by,ro.cancelled_at
 FROM return_order ro
 JOIN production_batches pb ON pb.id=ro.production_batch_id
 JOIN work_orders wo ON wo.id=ro.work_order_id`;

/** 余料回仓仅写退料单、库存流水和审计；不得修改需求、分配、生产状态或授权。 */
@Injectable()
export class MysqlProductionReturnRepository extends ProductionReturnRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {
    super();
  }

  async listReturnOrders(query: ReturnOrderQuery): Promise<PageResult<ReturnOrderItem>> {
    const where: string[] = [];
    const params: Array<string | number> = [];
    if (query.keyword) {
      where.push(
        '(ro.return_no LIKE ? OR pb.batch_no LIKE ? OR wo.work_order_no LIKE ? OR wo.product_code_snapshot LIKE ? OR wo.product_name_snapshot LIKE ?)',
      );
      params.push(...Array(5).fill(`%${query.keyword}%`));
    }
    if (query.status) {
      where.push('ro.status=?');
      params.push(query.status);
    }
    const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const [[count]] = await this.pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total FROM return_order ro
       JOIN production_batches pb ON pb.id=ro.production_batch_id
       JOIN work_orders wo ON wo.id=ro.work_order_id${clause}`,
      params,
    );
    const { page, pageSize, offset } = pagination(query);
    const [rows] = await this.pool.query<ReturnOrderRow[]>(
      `${RETURN_ORDER_SELECT}${clause} ORDER BY ro.id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );
    return {
      items: await this.mapReturnOrders(this.pool, rows),
      total: Number(count?.total ?? 0),
      page,
      pageSize,
    };
  }

  async getReturnOrder(returnId: string): Promise<ReturnOrderItem> {
    return this.loadReturnOrder(this.pool, returnId);
  }

  async listReturnBatchOptions(): Promise<ReturnOrderBatchOption[]> {
    const [rows] = await this.pool.query<
      (RowDataPacket & {
        production_batch_id: number;
        batch_no: string;
        work_order_no: string;
        product_code: string;
        product_name: string;
      })[]
    >(
      `SELECT DISTINCT pb.id production_batch_id,pb.batch_no,wo.work_order_no,
        wo.product_code_snapshot product_code,wo.product_name_snapshot product_name
       FROM production_batches pb
       JOIN work_orders wo ON wo.id=pb.work_order_id
       JOIN production_item_allocation a ON a.production_batch_id=pb.id
       WHERE EXISTS (
         SELECT 1 FROM outbound_detail od JOIN outbound_order oo ON oo.id=od.outbound_id
         WHERE od.allocation_id=a.id AND oo.status='completed'
       )
       ORDER BY pb.id DESC`,
    );
    return rows.map((row) => ({
      productionBatchId: String(row.production_batch_id),
      batchNo: row.batch_no,
      workOrderNo: row.work_order_no,
      productCode: row.product_code,
      productName: row.product_name,
    }));
  }

  async listReturnCandidates(batchId: string): Promise<ReturnOrderCandidateItem[]> {
    const rows = await this.findReturnCandidates(this.pool, batchId);
    return rows.filter((row) => returnableQuantity(row) > 0).map(mapReturnCandidate);
  }

  async createReturnOrder(payload: CreateReturnOrderPayload, context: CommandContext) {
    return withTransaction(this.pool, async (db) => {
      const batch = await findBatch(db, payload.productionBatchId, true);
      const allocationIds = payload.details.map((line) => line.allocationId).sort(numericSort);
      await lockIds(db, 'production_item_allocation', allocationIds);
      const candidateRows = await this.findReturnCandidates(db, payload.productionBatchId, true);
      const candidates = new Map(candidateRows.map((row) => [String(row.allocation_id), row]));
      for (const line of payload.details) {
        const candidate = candidates.get(line.allocationId);
        const remaining = candidate ? returnableQuantity(candidate) : 0;
        if (!candidate || line.returnQuantity <= 0 || line.returnQuantity > remaining) {
          throw new ProductionDomainError(
            'RETURN_QUANTITY_EXCEEDED',
            '退料数量超过当前已确认领料的可退数量，请刷新后重试',
          );
        }
      }
      const returnNo = businessNo('TL');
      const [created] = await db.execute<ResultSetHeader>(
        `INSERT INTO return_order
         (return_no,production_batch_id,work_order_id,status,remark,created_by,updated_by)
         VALUES (?,?,?,'pending',?,?,?)`,
        [
          returnNo,
          payload.productionBatchId,
          batch.work_order_id,
          payload.remark ?? null,
          context.actorId,
          context.actorId,
        ],
      );
      const returnId = String(created.insertId);
      for (const line of payload.details) {
        const candidate = candidates.get(line.allocationId)!;
        await db.execute(
          `INSERT INTO return_detail
           (return_id,production_batch_id,demand_id,allocation_id,item_id,material_variant_id,batch_id,
            return_number,unit_snapshot,return_stock_status,release_after_return,remark,created_by)
           VALUES (?,?,?,?,?,?,?,?,?,'available',1,?,?)`,
          [
            returnId,
            payload.productionBatchId,
            candidate.demand_id,
            candidate.allocation_id,
            candidate.item_id,
            candidate.material_variant_id,
            candidate.batch_id,
            line.returnQuantity,
            candidate.unit_snapshot,
            line.remark ?? null,
            context.actorId,
          ],
        );
      }
      await writeInventoryAudit(
        db,
        context,
        'production-return.create',
        'return_order',
        returnId,
        null,
        {
          returnNo,
          productionBatchId: payload.productionBatchId,
          status: 'pending',
          detailCount: payload.details.length,
        },
      );
      return this.loadReturnOrder(db, returnId);
    });
  }

  async confirmReturnOrder(returnId: string, version: number, context: CommandContext) {
    return withTransaction(this.pool, async (db) => {
      const [[identity]] = await db.query<(RowDataPacket & { production_batch_id: number })[]>(
        'SELECT production_batch_id FROM return_order WHERE id=?',
        [returnId],
      );
      if (!identity) throw new ProductionDomainError('NOT_FOUND', '退料单不存在');
      await findBatch(db, String(identity.production_batch_id), true);
      const order = await this.findReturnOrder(db, returnId, true);
      if (String(order.production_batch_id) !== String(identity.production_batch_id))
        throw new ProductionDomainError('CONCURRENT_MODIFICATION', '退料单所属批次已变化');
      if (order.status === 'returned') return this.loadReturnOrder(db, returnId, order);
      if (order.status !== 'pending')
        throw new ProductionDomainError('RETURN_CONFIRM_NOT_ALLOWED', '仅待确认退料单可以确认入库');
      requireVersion(order.version, version, '退料单');
      const details = await this.findReturnDetails(db, [returnId], true);
      await lockIds(
        db,
        'production_item_allocation',
        details.map((line) => String(line.allocation_id)).sort(numericSort),
      );
      await lockIds(
        db,
        'item_batch',
        [...new Set(details.map((line) => String(line.batch_id)))].sort(numericSort),
      );
      for (const line of details) {
        const [[quantity]] = await db.query<
          (RowDataPacket & { confirmed: string; occupied: string; loss: string })[]
        >(
          `SELECT
            COALESCE((SELECT SUM(od.outbound_number) FROM outbound_detail od
              JOIN outbound_order oo ON oo.id=od.outbound_id
              WHERE od.allocation_id=? AND oo.status='completed' FOR SHARE),0) confirmed,
            COALESCE((SELECT SUM(rd.return_number) FROM return_detail rd
              JOIN return_order ro ON ro.id=rd.return_id
              WHERE rd.allocation_id=? AND ro.status IN ('pending','returned') FOR SHARE),0) occupied,
            COALESCE((SELECT SUM(loss.scrap_number) FROM item_scrap loss
              WHERE loss.allocation_id=? AND loss.status IN ('pending','confirmed')
              FOR SHARE),0) loss`,
          [line.allocation_id, line.allocation_id, line.allocation_id],
        );
        if (
          integerQuantity(quantity?.confirmed ?? 0) <
          integerQuantity(quantity?.occupied ?? 0) + integerQuantity(quantity?.loss ?? 0)
        ) {
          throw new ProductionDomainError(
            'RETURN_QUANTITY_EXCEEDED',
            '退料数量超过当前已确认领料的可退数量，请刷新后重试',
          );
        }
      }
      for (const line of details) {
        await db.execute(
          `INSERT INTO inventory_transaction
           (item_id,material_variant_id,batch_id,transaction_type,quantity,unit_snapshot,stock_status,
            reference_type,reference_detail_id,idempotency_key,transaction_group_key,remark,created_by)
           VALUES (?,?,?,'material_return_inbound',?,?,'available','return_detail',?,?,?,?,?)`,
          [
            line.item_id,
            line.material_variant_id,
            line.batch_id,
            line.return_number,
            line.unit_snapshot,
            line.id,
            `RETURN:${line.id}`,
            `RETURN:${returnId}`,
            line.remark,
            context.actorId,
          ],
        );
      }
      const [updated] = await db.execute<ResultSetHeader>(
        `UPDATE return_order SET status='returned',return_at=CURRENT_TIMESTAMP,
         operator_id=?,updated_by=?,version=version+1
         WHERE id=? AND status='pending' AND version=?`,
        [context.actorId, context.actorId, returnId, version],
      );
      requireAffected(updated, '退料单');
      await writeInventoryAudit(
        db,
        context,
        'production-return.confirm',
        'return_order',
        returnId,
        { status: 'pending', version },
        {
          status: 'returned',
          version: version + 1,
        },
      );
      return this.loadReturnOrder(db, returnId);
    });
  }

  async cancelReturnOrder(
    returnId: string,
    version: number,
    reason: string,
    context: CommandContext,
  ) {
    return withTransaction(this.pool, async (db) => {
      const order = await this.findReturnOrder(db, returnId, true);
      if (order.status === 'cancelled') return this.loadReturnOrder(db, returnId, order);
      if (order.status !== 'pending')
        throw new ProductionDomainError('RETURN_CANCEL_NOT_ALLOWED', '仅待确认退料单可以取消');
      requireVersion(order.version, version, '退料单');
      const [updated] = await db.execute<ResultSetHeader>(
        `UPDATE return_order SET status='cancelled',cancel_reason=?,cancelled_by=?,cancelled_at=NOW(),updated_by=?,version=version+1
         WHERE id=? AND status='pending' AND version=?`,
        [reason, context.actorId, context.actorId, returnId, version],
      );
      requireAffected(updated, '退料单');
      await writeInventoryAudit(
        db,
        context,
        'production-return.cancel',
        'return_order',
        returnId,
        { status: 'pending', version },
        { status: 'cancelled', reason, version: version + 1 },
      );
      return this.loadReturnOrder(db, returnId);
    });
  }

  private async findReturnCandidates(db: Executor, batchId: string, lock = false) {
    // 写入校验使用当前读，避免事务早期建立的快照漏掉并发损耗占用。
    const currentRead = lock ? ' FOR SHARE' : '';
    const [rows] = await db.query<ReturnCandidateRow[]>(
      `SELECT a.id allocation_id,a.demand_id,a.production_batch_id,a.item_id,a.material_variant_id,a.batch_id,
        ib.item_code_snapshot,${currentMaterialNameSql('ib.item_id')} item_name,ib.material_variant_code_snapshot,ib.batch_code,a.unit_snapshot,
        COALESCE((SELECT SUM(od.outbound_number) FROM outbound_detail od
          JOIN outbound_order oo ON oo.id=od.outbound_id
          WHERE od.allocation_id=a.id AND oo.status='completed'${currentRead}),0) confirmed_quantity,
        COALESCE((SELECT SUM(rd.return_number) FROM return_detail rd
          JOIN return_order ro ON ro.id=rd.return_id
          WHERE rd.allocation_id=a.id AND ro.status IN ('pending','returned')${currentRead}),0) occupied_quantity,
        COALESCE((SELECT SUM(loss.scrap_number) FROM item_scrap loss
          WHERE loss.allocation_id=a.id AND loss.status IN ('pending','confirmed')${currentRead}),0) occupied_loss_quantity
       FROM production_item_allocation a JOIN item_batch ib ON ib.id=a.batch_id
       WHERE a.production_batch_id=?
       ORDER BY a.id`,
      [batchId],
    );
    return rows;
  }

  private async findReturnOrder(db: Executor, id: string, lock = false) {
    const [[row]] = await db.query<ReturnOrderRow[]>(
      `${RETURN_ORDER_SELECT} WHERE ro.id=?${lock ? ' FOR UPDATE' : ''}`,
      [id],
    );
    if (!row) throw new ProductionDomainError('NOT_FOUND', '退料单不存在');
    return row;
  }

  private async findReturnDetails(db: Executor, orderIds: string[], lock = false) {
    if (!orderIds.length) return [];
    const [rows] = await db.query<ReturnDetailRow[]>(
      `SELECT rd.id,rd.return_id,rd.allocation_id,rd.demand_id,rd.item_id,rd.material_variant_id,rd.batch_id,
       ib.item_code_snapshot,${currentMaterialNameSql('ib.item_id')} item_name,ib.material_variant_code_snapshot,ib.batch_code,rd.return_number,
       rd.unit_snapshot,rd.return_stock_status,rd.release_after_return,it.id inventory_transaction_id,
       rd.remark
       FROM return_detail rd JOIN item_batch ib ON ib.id=rd.batch_id
       LEFT JOIN inventory_transaction it ON it.reference_type='return_detail'
         AND it.reference_detail_id=rd.id AND it.transaction_type='material_return_inbound'
       WHERE rd.return_id IN (${placeholders(orderIds)}) ORDER BY rd.return_id,rd.id${lock ? ' FOR UPDATE' : ''}`,
      orderIds,
    );
    return rows;
  }

  private async mapReturnOrders(db: Executor, rows: ReturnOrderRow[]) {
    if (!rows.length) return [];
    const details = await this.findReturnDetails(
      db,
      rows.map((row) => String(row.id)),
    );
    const byOrder = groupBy(details, (line) => String(line.return_id));
    return rows.map((row) => mapReturnOrder(row, byOrder.get(String(row.id)) ?? []));
  }

  private async loadReturnOrder(db: Executor, id: string, known?: ReturnOrderRow) {
    const row = known ?? (await this.findReturnOrder(db, id));
    const details = await this.findReturnDetails(db, [id]);
    return mapReturnOrder(row, details);
  }
}

const returnableQuantity = (row: ReturnCandidateRow): number =>
  integerQuantity(row.confirmed_quantity) -
  integerQuantity(row.occupied_quantity) -
  integerQuantity(row.occupied_loss_quantity);

const mapReturnCandidate = (row: ReturnCandidateRow): ReturnOrderCandidateItem => ({
  allocationId: String(row.allocation_id),
  demandId: String(row.demand_id),
  itemId: String(row.item_id),
  materialVariantId: String(row.material_variant_id),
  materialVariantCode: row.material_variant_code_snapshot,
  itemCode: row.item_code_snapshot,
  itemName: row.item_name,
  itemBatchId: String(row.batch_id),
  batchCode: row.batch_code,
  confirmedOutboundQuantity: decimal(integerQuantity(row.confirmed_quantity)),
  occupiedReturnQuantity: decimal(integerQuantity(row.occupied_quantity)),
  returnableQuantity: decimal(returnableQuantity(row)),
  unit: row.unit_snapshot,
});

const mapReturnOrder = (row: ReturnOrderRow, details: ReturnDetailRow[]): ReturnOrderItem => ({
  id: String(row.id),
  returnNo: row.return_no,
  productionBatchId: String(row.production_batch_id),
  batchNo: row.batch_no,
  workOrderId: String(row.work_order_id),
  workOrderNo: row.work_order_no,
  productCode: row.product_code,
  productName: row.product_name,
  status: row.status,
  returnAt: iso(row.return_at),
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
  details: details.map((line) => ({
    id: String(line.id),
    allocationId: String(line.allocation_id),
    demandId: String(line.demand_id),
    itemId: String(line.item_id),
    materialVariantId: String(line.material_variant_id),
    materialVariantCode: line.material_variant_code_snapshot,
    itemCode: line.item_code_snapshot,
    itemName: line.item_name,
    itemBatchId: String(line.batch_id),
    batchCode: line.batch_code,
    returnQuantity: line.return_number,
    unit: line.unit_snapshot,
    returnStockStatus: 'available',
    releaseAfterReturn: true,
    inventoryTransactionId:
      line.inventory_transaction_id === null ? null : String(line.inventory_transaction_id),
    remark: line.remark,
  })),
});
