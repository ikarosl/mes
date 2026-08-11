import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { withTransaction } from '@company/database';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  AvailableItemBatchItem,
  CreateMaterialAllocationsPayload,
  CreateMaterialOutboundPayload,
  MaterialAllocationCommandResult,
  MaterialOutboundCommandResult,
  MaterialOutboundItem,
  ProductionMaterialAllocationItem,
  ProductionMaterialDemandItem,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import { toBeijingISOString } from '../../../common/time/beijing-time.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { ProductionMaterialRepository } from '../application/ports/production-material.repository.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import {
  requireMaterialAllocationBatchStatus,
  requireMaterialOutboundBatchStatus,
} from '../domain/production-material.policy.js';
import {
  ALLOCATION_SELECT,
  DEMAND_SELECT,
  bigintCompare,
  dateOnly,
  decimal,
  mapAllocation,
  mapDemand,
  placeholders,
  type AllocationRow,
  type AvailableRow,
  type DemandRow,
  type OutboundDetailRow,
  type OutboundRow,
} from './mysql-production-material.mapper.js';
import { findBatch } from './mysql-production.shared.js';

@Injectable()
export class MysqlProductionMaterialRepository extends ProductionMaterialRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {
    super();
  }

  async listDemands(batchId: string): Promise<ProductionMaterialDemandItem[]> {
    await findBatch(this.pool, batchId);
    const [rows] = await this.pool.query<DemandRow[]>(
      `${DEMAND_SELECT} WHERE d.production_batch_id=? ORDER BY d.id`,
      [batchId],
    );
    const [allocations] = await this.pool.query<AllocationRow[]>(
      `${ALLOCATION_SELECT} WHERE a.production_batch_id=? ORDER BY a.id`,
      [batchId],
    );
    const byDemand = new Map<string, ProductionMaterialAllocationItem[]>();
    for (const row of allocations) {
      const key = String(row.demand_id);
      byDemand.set(key, [...(byDemand.get(key) ?? []), mapAllocation(row)]);
    }
    return rows.map((row) => mapDemand(row, byDemand.get(String(row.id)) ?? []));
  }

  async listAvailableItemBatches(demandId: string): Promise<AvailableItemBatchItem[]> {
    const [[demand]] = await this.pool.query<(RowDataPacket & { item_id: number })[]>(
      "SELECT item_id FROM production_item_demand WHERE id=? AND business_status='active'",
      [demandId],
    );
    if (!demand) throw new ProductionDomainError('NOT_FOUND', '有效物料需求不存在');
    const [rows] = await this.pool.query<AvailableRow[]>(
      `SELECT ib.id,ib.item_id,ib.item_code_snapshot,ib.product_name_snapshot,ib.batch_code,ib.unit_snapshot,ib.source_type,ib.provider,ib.production_date,
       COALESCE(SUM(CASE WHEN it.stock_status='available' THEN it.quantity ELSE 0 END),0) on_hand,
       COALESCE((SELECT SUM(GREATEST(a.assigned_number-COALESCE((SELECT SUM(od.outbound_number) FROM outbound_detail od WHERE od.allocation_id=a.id),0),0)) FROM production_item_allocation a WHERE a.batch_id=ib.id AND a.allocation_status NOT IN ('released','cancelled')),0) reserved
       FROM item_batch ib LEFT JOIN inventory_transaction it ON it.batch_id=ib.id AND it.item_id=ib.item_id
       WHERE ib.item_id=? AND ib.batch_status='available'
       GROUP BY ib.id ORDER BY ib.id`,
      [demand.item_id],
    );
    return rows.map((row) => ({
      itemBatchId: String(row.id),
      itemId: String(row.item_id),
      itemCode: row.item_code_snapshot,
      itemName: row.product_name_snapshot,
      batchCode: row.batch_code,
      unit: row.unit_snapshot,
      sourceType: row.source_type,
      provider: row.provider,
      productionDate: dateOnly(row.production_date),
      onHandAvailableQuantity: row.on_hand,
      reservedQuantity: row.reserved,
      availableToAllocateQuantity: decimal(Math.max(0, Number(row.on_hand) - Number(row.reserved))),
    }));
  }

  async createAllocations(
    batchId: string,
    payload: CreateMaterialAllocationsPayload,
    context: CommandContext,
  ): Promise<MaterialAllocationCommandResult> {
    return withTransaction(this.pool, async (connection) => {
      const batch = await findBatch(connection, batchId, true);
      requireMaterialAllocationBatchStatus(batch.status);
      const pairs = new Set(
        payload.allocations.map((line) => `${line.demandId}:${line.itemBatchId}`),
      );
      if (pairs.size !== payload.allocations.length)
        throw new ProductionDomainError('INVALID_INPUT', '同一需求与库存批次只能提交一条分配明细');
      const batchIds = [...new Set(payload.allocations.map((line) => line.itemBatchId))].sort(
        bigintCompare,
      );
      const demandIds = [...new Set(payload.allocations.map((line) => line.demandId))].sort(
        bigintCompare,
      );
      await lockIds(connection, 'item_batch', batchIds);
      await lockIds(connection, 'production_item_demand', demandIds);
      const inserted: string[] = [];
      for (const line of payload.allocations) {
        const [[demand]] = await connection.query<
          (RowDataPacket & {
            production_batch_id: number;
            item_id: number;
            unit_snapshot: string;
            need_number: string;
            business_status: string;
          })[]
        >(
          'SELECT production_batch_id,item_id,unit_snapshot,need_number,business_status FROM production_item_demand WHERE id=?',
          [line.demandId],
        );
        const [[stockBatch]] = await connection.query<
          (RowDataPacket & { item_id: number; batch_status: string })[]
        >('SELECT item_id,batch_status FROM item_batch WHERE id=?', [line.itemBatchId]);
        if (!demand || String(demand.production_batch_id) !== batchId)
          throw new ProductionDomainError('NOT_FOUND', '物料需求不属于当前生产批次');
        if (demand.business_status !== 'active')
          throw new ProductionDomainError('INVALID_STATE', '只有有效物料需求可以分配');
        if (
          !stockBatch ||
          stockBatch.item_id !== demand.item_id ||
          stockBatch.batch_status !== 'available'
        )
          throw new ProductionDomainError('INVALID_INPUT', '库存批次不可用或物料不匹配');
        const [[totals]] = await connection.query<
          (RowDataPacket & { allocated: string; on_hand: string; reserved: string })[]
        >(
          `SELECT
           COALESCE((SELECT SUM(assigned_number) FROM production_item_allocation WHERE demand_id=? AND allocation_status NOT IN ('released','cancelled')),0) allocated,
           COALESCE((SELECT SUM(quantity) FROM inventory_transaction WHERE batch_id=? AND item_id=? AND stock_status='available'),0) on_hand,
           COALESCE((SELECT SUM(GREATEST(a.assigned_number-COALESCE((SELECT SUM(od.outbound_number) FROM outbound_detail od WHERE od.allocation_id=a.id),0),0)) FROM production_item_allocation a WHERE a.batch_id=? AND a.allocation_status NOT IN ('released','cancelled')),0) reserved`,
          [line.demandId, line.itemBatchId, demand.item_id, line.itemBatchId],
        );
        if (
          Number(totals!.allocated) + line.assignedQuantity >
          Number(demand.need_number) + 0.0000001
        )
          throw new ProductionDomainError('ALLOCATION_EXCEEDS_DEMAND', '分配数量超过需求剩余缺口');
        if (line.assignedQuantity > Number(totals!.on_hand) - Number(totals!.reserved) + 0.0000001)
          throw new ProductionDomainError('INSUFFICIENT_AVAILABLE_STOCK', '库存批次可分配数量不足');
        const [result] = await connection.execute<ResultSetHeader>(
          `INSERT INTO production_item_allocation (demand_id,production_batch_id,item_id,batch_id,assigned_number,unit_snapshot,remark,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?)`,
          [
            line.demandId,
            batchId,
            demand.item_id,
            line.itemBatchId,
            line.assignedQuantity,
            demand.unit_snapshot,
            line.remark ?? null,
            context.actorId,
            context.actorId,
          ],
        );
        inserted.push(String(result.insertId));
      }
      const complete = await allDemandsAllocated(connection, batchId);
      if (complete && batch.status === 'material_pending') {
        await connection.execute(
          "UPDATE production_batches SET status='material_assigned',version=version+1,updated_by=? WHERE id=?",
          [context.actorId, batchId],
        );
      }
      await this.audit(connection, context, 'production-material.allocate', batchId, null, {
        allocationIds: inserted,
      });
      const current = await findBatch(connection, batchId);
      return {
        productionBatchId: batchId,
        batchStatus: current.status,
        batchVersion: current.version,
        allocations: await this.getAllocations(connection, inserted),
      };
    });
  }

  async releaseAllocation(
    batchId: string,
    allocationId: string,
    version: number,
    context: CommandContext,
  ): Promise<ProductionMaterialAllocationItem> {
    return withTransaction(this.pool, async (connection) => {
      const batch = await findBatch(connection, batchId, true);
      requireMaterialAllocationBatchStatus(batch.status);
      const [[row]] = await connection.query<AllocationRow[]>(
        `${ALLOCATION_SELECT} WHERE a.id=? AND a.production_batch_id=? FOR UPDATE`,
        [allocationId, batchId],
      );
      if (!row) throw new ProductionDomainError('NOT_FOUND', '物料分配不存在');
      if (row.allocation_status === 'released') return mapAllocation(row);
      if (row.allocation_status !== 'active')
        throw new ProductionDomainError('INVALID_STATE', '当前分配状态不能释放');
      if (Number(row.outbound_quantity) > 0)
        throw new ProductionDomainError('ALLOCATION_ALREADY_OUTBOUND', '已发生出库的分配不能释放');
      const [result] = await connection.execute<ResultSetHeader>(
        "UPDATE production_item_allocation SET allocation_status='released',version=version+1,updated_by=? WHERE id=? AND production_batch_id=? AND version=? AND allocation_status='active'",
        [context.actorId, allocationId, batchId, version],
      );
      if (result.affectedRows !== 1)
        throw new ProductionDomainError(
          'CONCURRENT_MODIFICATION',
          '物料分配已被其他操作修改，请刷新后重试',
        );
      if (!(await allDemandsAllocated(connection, batchId)) && batch.status === 'material_assigned')
        await connection.execute(
          "UPDATE production_batches SET status='material_pending',version=version+1,updated_by=? WHERE id=?",
          [context.actorId, batchId],
        );
      await this.audit(
        connection,
        context,
        'production-material.release',
        allocationId,
        { status: row.allocation_status, version: row.version },
        { status: 'released', version: version + 1 },
      );
      const [updated] = await this.getAllocations(connection, [allocationId]);
      return updated!;
    });
  }

  async createOutbound(
    batchId: string,
    payload: CreateMaterialOutboundPayload,
    context: CommandContext,
  ): Promise<MaterialOutboundCommandResult> {
    return withTransaction(this.pool, async (connection) => {
      const batch = await findBatch(connection, batchId, true);
      requireMaterialOutboundBatchStatus(batch.status);
      const allocationIds = [...new Set(payload.details.map((line) => line.allocationId))].sort(
        bigintCompare,
      );
      if (allocationIds.length !== payload.details.length)
        throw new ProductionDomainError('INVALID_INPUT', '同一分配只能提交一条出库明细');
      await lockIds(connection, 'production_item_allocation', allocationIds);
      const [allocations] = await connection.query<AllocationRow[]>(
        `${ALLOCATION_SELECT} WHERE a.id IN (${placeholders(allocationIds)}) AND a.production_batch_id=? ORDER BY a.id`,
        [...allocationIds, batchId],
      );
      if (allocations.length !== allocationIds.length)
        throw new ProductionDomainError('NOT_FOUND', '出库分配不存在或不属于当前批次');
      const byId = new Map(allocations.map((row) => [String(row.id), row]));
      const itemBatchIds = [...new Set(allocations.map((row) => String(row.batch_id)))].sort(
        bigintCompare,
      );
      await lockIds(connection, 'item_batch', itemBatchIds);
      const requestedByStockBatch = new Map<
        string,
        { batchId: number; itemId: number; quantity: number }
      >();
      for (const line of payload.details) {
        const allocation = byId.get(line.allocationId)!;
        if (allocation.allocation_status !== 'active')
          throw new ProductionDomainError('INVALID_STATE', '只有有效分配可以出库');
        if (
          line.outboundQuantity >
          Number(allocation.assigned_number) - Number(allocation.outbound_quantity) + 0.0000001
        )
          throw new ProductionDomainError(
            'OUTBOUND_EXCEEDS_ALLOCATION',
            '出库数量超过分配未出库量',
          );
        const stockKey = `${allocation.batch_id}:${allocation.item_id}`;
        const requested = requestedByStockBatch.get(stockKey);
        requestedByStockBatch.set(stockKey, {
          batchId: allocation.batch_id,
          itemId: allocation.item_id,
          quantity: (requested?.quantity ?? 0) + line.outboundQuantity,
        });
      }
      for (const requested of requestedByStockBatch.values()) {
        const [[stock]] = await connection.query<(RowDataPacket & { quantity: string })[]>(
          "SELECT COALESCE(SUM(quantity),0) quantity FROM inventory_transaction WHERE batch_id=? AND item_id=? AND stock_status='available'",
          [requested.batchId, requested.itemId],
        );
        if (requested.quantity > Number(stock!.quantity) + 0.0000001)
          throw new ProductionDomainError('INSUFFICIENT_AVAILABLE_STOCK', '库存账面可用数量不足');
      }
      const outboundNo = `PMO-${Date.now()}-${randomUUID().slice(0, 8)}`;
      const [orderResult] = await connection.execute<ResultSetHeader>(
        `INSERT INTO outbound_order (outbound_no,production_batch_id,work_order_id,status,outbound_at,operator_id,remark,created_by,updated_by) VALUES (?,?,?,'completed',NOW(),?,?,?,?)`,
        [
          outboundNo,
          batchId,
          batch.work_order_id,
          context.actorId,
          payload.remark ?? null,
          context.actorId,
          context.actorId,
        ],
      );
      for (const line of payload.details) {
        const allocation = byId.get(line.allocationId)!;
        const [detailResult] = await connection.execute<ResultSetHeader>(
          `INSERT INTO outbound_detail (outbound_id,production_batch_id,demand_id,allocation_id,item_id,batch_id,outbound_number,unit_snapshot,created_by) VALUES (?,?,?,?,?,?,?,?,?)`,
          [
            orderResult.insertId,
            batchId,
            allocation.demand_id,
            allocation.id,
            allocation.item_id,
            allocation.batch_id,
            line.outboundQuantity,
            allocation.unit_snapshot,
            context.actorId,
          ],
        );
        await connection.execute(
          `INSERT INTO inventory_transaction (item_id,batch_id,transaction_type,quantity,unit_snapshot,stock_status,reference_type,reference_detail_id,idempotency_key,created_by) VALUES (?,?,'production_material_outbound',? * -1,?,'available','outbound_detail',?,?,?)`,
          [
            allocation.item_id,
            allocation.batch_id,
            line.outboundQuantity,
            allocation.unit_snapshot,
            detailResult.insertId,
            `PMO:${orderResult.insertId}:${detailResult.insertId}`,
            context.actorId,
          ],
        );
      }
      if (await allDemandsOutbound(connection, batchId))
        await connection.execute(
          "UPDATE production_batches SET status='material_outbound',version=version+1,updated_by=? WHERE id=? AND status='material_assigned'",
          [context.actorId, batchId],
        );
      await this.audit(
        connection,
        context,
        'production-material.outbound',
        String(orderResult.insertId),
        null,
        { outboundNo, detailCount: payload.details.length },
      );
      const current = await findBatch(connection, batchId);
      const outbound = await this.getOutbound(connection, String(orderResult.insertId));
      return {
        productionBatchId: batchId,
        batchStatus: current.status,
        batchVersion: current.version,
        outbound,
      };
    });
  }

  async listOutbounds(batchId: string): Promise<MaterialOutboundItem[]> {
    await findBatch(this.pool, batchId);
    const [rows] = await this.pool.query<OutboundRow[]>(
      'SELECT id,outbound_no,production_batch_id,status,outbound_at,operator_id,remark FROM outbound_order WHERE production_batch_id=? ORDER BY created_at DESC,id DESC',
      [batchId],
    );
    return Promise.all(rows.map((row) => this.getOutbound(this.pool, String(row.id), row)));
  }

  private async getAllocations(
    db: Pool | PoolConnection,
    ids: string[],
  ): Promise<ProductionMaterialAllocationItem[]> {
    if (ids.length === 0) return [];
    const [rows] = await db.query<AllocationRow[]>(
      `${ALLOCATION_SELECT} WHERE a.id IN (${placeholders(ids)}) ORDER BY a.id`,
      ids,
    );
    return rows.map(mapAllocation);
  }
  private async getOutbound(
    db: Pool | PoolConnection,
    id: string,
    known?: OutboundRow,
  ): Promise<MaterialOutboundItem> {
    let row = known;
    if (!row) {
      const [[found]] = await db.query<OutboundRow[]>(
        'SELECT id,outbound_no,production_batch_id,status,outbound_at,operator_id,remark FROM outbound_order WHERE id=?',
        [id],
      );
      row = found;
    }
    if (!row) throw new ProductionDomainError('NOT_FOUND', '生产领料出库单不存在');
    const [details] = await db.query<OutboundDetailRow[]>(
      `SELECT od.id,od.outbound_id,od.allocation_id,od.demand_id,od.item_id,od.batch_id,ib.batch_code,ib.item_code_snapshot,ib.product_name_snapshot,od.outbound_number,od.unit_snapshot FROM outbound_detail od JOIN item_batch ib ON ib.id=od.batch_id WHERE od.outbound_id=? ORDER BY od.id`,
      [id],
    );
    return {
      outboundId: String(row.id),
      outboundNo: row.outbound_no,
      productionBatchId: String(row.production_batch_id),
      status: row.status,
      outboundAt: toBeijingISOString(row.outbound_at),
      operatorId: String(row.operator_id),
      operatorName: null,
      remark: row.remark,
      details: details.map((detail) => ({
        id: String(detail.id),
        allocationId: String(detail.allocation_id),
        demandId: String(detail.demand_id),
        itemId: String(detail.item_id),
        itemBatchId: String(detail.batch_id),
        batchCode: detail.batch_code,
        itemCode: detail.item_code_snapshot,
        itemName: detail.product_name_snapshot,
        outboundQuantity: detail.outbound_number,
        unit: detail.unit_snapshot,
      })),
    };
  }
  private audit(
    connection: PoolConnection,
    context: CommandContext,
    action: string,
    targetId: string,
    beforeData: unknown,
    afterData: unknown,
  ): Promise<void> {
    return writeTransactionalAudit(connection, {
      logType: 'business',
      module: 'production',
      action,
      userId: context.actorId,
      targetId,
      targetType: action.includes('outbound') ? 'outbound_order' : 'production_item_allocation',
      result: 'success',
      beforeData,
      afterData,
      requestId: context.requestId,
      ip: context.ip,
      userAgent: context.userAgent,
    });
  }
}

const lockIds = async (
  connection: PoolConnection,
  table: 'item_batch' | 'production_item_demand' | 'production_item_allocation',
  ids: string[],
) => {
  if (ids.length === 0) return;
  await connection.query(
    `SELECT id FROM ${table} WHERE id IN (${placeholders(ids)}) ORDER BY id FOR UPDATE`,
    ids,
  );
};
const allDemandsAllocated = async (db: PoolConnection, batchId: string) => {
  const [[row]] = await db.query<(RowDataPacket & { missing: number })[]>(
    `SELECT COUNT(*) missing FROM production_item_demand d WHERE d.production_batch_id=? AND d.demand_type='normal' AND d.business_status='active' AND COALESCE((SELECT SUM(a.assigned_number) FROM production_item_allocation a WHERE a.demand_id=d.id AND a.allocation_status NOT IN ('released','cancelled')),0)<d.need_number`,
    [batchId],
  );
  return Number(row?.missing ?? 1) === 0;
};
const allDemandsOutbound = async (db: PoolConnection, batchId: string) => {
  const [[row]] = await db.query<(RowDataPacket & { missing: number })[]>(
    `SELECT COUNT(*) missing FROM production_item_demand d WHERE d.production_batch_id=? AND d.business_status='active' AND COALESCE((SELECT SUM(od.outbound_number) FROM outbound_detail od WHERE od.demand_id=d.id),0)<d.need_number`,
    [batchId],
  );
  return Number(row?.missing ?? 1) === 0;
};
