import {
  InventoryStockCommand,
  InventoryProductionDocumentCommand,
} from '../../inventory/public.js';
import { materialQuantitiesOf } from './mysql-production-material-facts.js';
import {
  MATERIAL_RETURN_ORDER_SELECT as RETURN_ORDER_SELECT,
  MATERIAL_RETURN_ORDER_COUNT,
  MATERIAL_RETURN_BATCH_OPTIONS_SQL,
  materialReturnDetailsSql,
} from './queries/material-return-display.sql.js';
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
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { toBeijingISOString } from '../../../common/time/date-time.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { integerQuantity } from '../domain/integer-quantity.js';
import { findBatch } from './mysql-production.shared.js';
import { ProductionReturnRepository } from '../application/ports/production-return.repository.js';
import {
  pagination,
  numericSort,
  decimal,
  iso,
  requireVersion,
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
  inventory_transaction_id: number | string | null;
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

/** 余料回仓仅写退料单、库存流水和审计；不得修改需求、分配、生产状态或授权。 */
@Injectable()
export class MysqlProductionReturnRepository extends ProductionReturnRepository {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly inventory: InventoryStockCommand,
    private readonly documents: InventoryProductionDocumentCommand,
  ) {
    super();
  }

  async listReturnOrders(query: ReturnOrderQuery): Promise<PageResult<ReturnOrderItem>> {
    const where: string[] = ["ro.source_type='return_inbound'"];
    const params: Array<string | number> = [];
    if (query.keyword) {
      where.push(
        '(ro.inbound_no LIKE ? OR pb.batch_no LIKE ? OR wo.work_order_no LIKE ? OR wo.product_code_snapshot LIKE ? OR wo.product_name_snapshot LIKE ?)',
      );
      params.push(...Array(5).fill(`%${query.keyword}%`));
    }
    if (query.status) {
      where.push('ro.status=?');
      params.push(query.status === 'returned' ? 'completed' : query.status);
    }
    const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const [[count]] = await this.pool.query<(RowDataPacket & { total: number })[]>(
      `${MATERIAL_RETURN_ORDER_COUNT}${clause}`,
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
    >(MATERIAL_RETURN_BATCH_OPTIONS_SQL);
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
      if (new Set(allocationIds).size !== allocationIds.length)
        throw new ProductionDomainError('INVALID_INPUT', '同一分配只能提交一条退料明细');
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
      const created = await this.documents.createReturn(
        {
          productionBatchId: payload.productionBatchId,
          workOrderId: String(batch.work_order_id),
          remark: payload.remark,
          lines: payload.details.map((line) => {
            const candidate = candidates.get(line.allocationId)!;
            return {
              allocationId: line.allocationId,
              demandId: String(candidate.demand_id),
              itemId: String(candidate.item_id),
              materialVariantId: String(candidate.material_variant_id),
              batchId: String(candidate.batch_id),
              quantity: String(line.returnQuantity),
              unit: candidate.unit_snapshot,
              remark: line.remark,
            };
          }),
        },
        context,
      );
      const returnId = created.id;
      await writeInventoryAudit(
        db,
        context,
        'production-return.create',
        'inbound_order',
        returnId,
        null,
        {
          returnNo: created.no,
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
      const identity = await this.documents.getReturn(returnId);
      await findBatch(db, identity.productionBatchId, true);
      const order = await this.documents.getReturn(returnId, true);
      if (order.productionBatchId !== identity.productionBatchId)
        throw new ProductionDomainError('CONCURRENT_MODIFICATION', '退料单所属批次已变化');
      if (order.status === 'completed') return this.loadReturnOrder(db, returnId);
      if (order.status !== 'pending')
        throw new ProductionDomainError('RETURN_CONFIRM_NOT_ALLOWED', '仅待确认退料单可以确认入库');
      requireVersion(order.version, version, '退料单');
      await lockIds(
        db,
        'production_item_allocation',
        order.details.map((line) => line.allocationId).sort(numericSort),
      );
      const candidates = new Map(
        (await this.findReturnCandidates(db, order.productionBatchId, true)).map((row) => [
          String(row.allocation_id),
          row,
        ]),
      );
      // 当前单已在 occupied 中；只核对全部占用，不重复减本次退料。
      for (const line of order.details) {
        const candidate = candidates.get(line.allocationId);
        if (!candidate || returnableQuantity(candidate) < 0)
          throw new ProductionDomainError(
            'RETURN_QUANTITY_EXCEEDED',
            '退料数量超过当前已确认领料的可退数量，请刷新后重试',
          );
      }
      await this.documents.completeReturn(returnId, version, context);
      await writeInventoryAudit(
        db,
        context,
        'production-return.confirm',
        'inbound_order',
        returnId,
        { status: 'pending', version },
        { status: 'returned', version: version + 1 },
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
      const identity = await this.documents.getReturn(returnId);
      await findBatch(db, identity.productionBatchId, true);
      const order = await this.documents.getReturn(returnId, true);
      if (order.status === 'cancelled') return this.loadReturnOrder(db, returnId);
      if (order.status !== 'pending')
        throw new ProductionDomainError('RETURN_CANCEL_NOT_ALLOWED', '仅待确认退料单可以取消');
      requireVersion(order.version, version, '退料单');
      await this.documents.cancelReturn(returnId, version, reason, context);
      await writeInventoryAudit(
        db,
        context,
        'production-return.cancel',
        'inbound_order',
        returnId,
        { status: 'pending', version },
        { status: 'cancelled', reason, version: version + 1 },
      );
      return this.loadReturnOrder(db, returnId);
    });
  }

  private async findReturnCandidates(db: Executor, batchId: string, lock = false) {
    // 写入校验使用当前读，避免事务早期建立的快照漏掉并发损耗占用。
    const currentRead = lock ? ' FOR SHARE NOWAIT' : '';
    const [rows] = await db.query<ReturnCandidateRow[]>(
      `SELECT a.id allocation_id,a.demand_id,a.production_batch_id,a.item_id,a.material_variant_id,a.batch_id,
        NULL item_code_snapshot,NULL item_name,NULL material_variant_code_snapshot,NULL batch_code,a.unit_snapshot,
        0 confirmed_quantity,0 occupied_quantity,
        COALESCE((SELECT SUM(loss.scrap_number) FROM item_scrap loss
          WHERE loss.allocation_id=a.id AND loss.status IN ('pending','confirmed')${currentRead}),0) occupied_loss_quantity
       FROM production_item_allocation a
       WHERE a.production_batch_id=?
       ORDER BY a.id${currentRead}`,
      [batchId],
    );
    const quantities = materialQuantitiesOf(
      await this.documents.facts({ productionBatchId: batchId, lock }),
    );
    for (const row of rows) {
      row.confirmed_quantity = String(quantities.issued.get(String(row.allocation_id)) ?? 0);
      row.occupied_quantity = String(quantities.occupiedReturn.get(String(row.allocation_id)) ?? 0);
    }
    await this.decorateBatches(rows);
    return rows;
  }

  private async findReturnOrder(db: Executor, id: string) {
    const [[row]] = await db.query<ReturnOrderRow[]>(
      `${RETURN_ORDER_SELECT} WHERE ro.source_type='return_inbound' AND ro.id=?`,
      [id],
    );
    if (!row) throw new ProductionDomainError('NOT_FOUND', '退料单不存在');
    return row;
  }

  private async findReturnDetails(db: Executor, orderIds: string[]) {
    if (!orderIds.length) return [];
    const [rows] = await db.query<ReturnDetailRow[]>(materialReturnDetailsSql(orderIds), orderIds);
    return rows;
  }

  private async decorateBatches(rows: Array<ReturnCandidateRow | ReturnDetailRow>): Promise<void> {
    const batchIds = [...new Set(rows.map((row) => String(row.batch_id)))];
    const references = await this.inventory.materialBatchReferences(batchIds);
    const batches = new Map(references.map((row) => [row.id, row]));
    for (const row of rows) {
      const batch = batches.get(String(row.batch_id));
      if (!batch) throw new ProductionDomainError('NOT_FOUND', '库存批次不存在');
      row.item_code_snapshot = batch.itemCode;
      row.item_name = batch.itemName;
      row.material_variant_code_snapshot = batch.materialVariantCode;
      row.batch_code = batch.batchCode;
    }
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
  occupiedLossQuantity: decimal(integerQuantity(row.occupied_loss_quantity)),
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
    returnQuantity: String(line.return_number),
    unit: line.unit_snapshot,
    inventoryTransactionId:
      line.inventory_transaction_id === null ? null : String(line.inventory_transaction_id),
    remark: line.remark,
  })),
});
