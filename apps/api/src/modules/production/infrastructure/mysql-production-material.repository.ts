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
  MaterialOutboundQuery,
  MaterialOutboundBatchOption,
  MaterialOutboundCandidateItem,
  PageResult,
  ProductionMaterialAllocationItem,
  ProductionMaterialDemandItem,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import { toBeijingISOString, toDateOnlyString } from '../../../common/time/date-time.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { ProductionMaterialRepository } from '../application/ports/production-material.repository.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { integerQuantity } from '../domain/integer-quantity.js';
import {
  requireMaterialAllocationBatchStatus,
  requireMaterialOutboundBatchStatus,
} from '../domain/production-material.policy.js';
import {
  ALLOCATION_SELECT,
  DEMAND_SELECT,
  bigintCompare,
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
import { fulfillReadySupplements } from './mysql-production-supplement-activation.js';

@Injectable()
export class MysqlProductionMaterialRepository extends ProductionMaterialRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {
    super();
  }

  async findBatchIdsWithActiveOutbounds(batchIds: string[]): Promise<Set<string>> {
    if (batchIds.length === 0) return new Set();
    const [rows] = await this.pool.query<(RowDataPacket & { production_batch_id: number })[]>(
      `SELECT DISTINCT production_batch_id FROM outbound_order
       WHERE status<>'cancelled' AND production_batch_id IN (${placeholders(batchIds)})`,
      batchIds,
    );
    return new Set(rows.map((row) => String(row.production_batch_id)));
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
       COALESCE((SELECT SUM(GREATEST(a.assigned_number-COALESCE((SELECT SUM(od.outbound_number) FROM outbound_detail od JOIN outbound_order oo ON oo.id=od.outbound_id WHERE od.allocation_id=a.id AND oo.status='completed'),0),0)) FROM production_item_allocation a WHERE a.batch_id=ib.id AND a.allocation_status NOT IN ('released','cancelled')),0) reserved
       FROM item_batch ib LEFT JOIN inventory_transaction it ON it.batch_id=ib.id AND it.item_id=ib.item_id
       WHERE ib.item_id=? AND ib.batch_status='available'
       GROUP BY ib.id
       HAVING on_hand > 0
       ORDER BY ib.id`,
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
      productionDate: toDateOnlyString(row.production_date),
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
      const [demandTypes] = await connection.query<
        (RowDataPacket & { id: number; demand_type: string })[]
      >(
        `SELECT id,demand_type FROM production_item_demand WHERE id IN (${placeholders(demandIds)}) ORDER BY id`,
        demandIds,
      );
      requireMaterialAllocationBatchStatus(
        batch.status,
        demandTypes.length === demandIds.length &&
          demandTypes.every((row) => isSupplementDemand(row.demand_type)),
      );
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
           COALESCE((SELECT SUM(GREATEST(a.assigned_number-COALESCE((SELECT SUM(od.outbound_number) FROM outbound_detail od JOIN outbound_order oo ON oo.id=od.outbound_id WHERE od.allocation_id=a.id AND oo.status='completed'),0),0)) FROM production_item_allocation a WHERE a.batch_id=? AND a.allocation_status NOT IN ('released','cancelled')),0) reserved`,
          [line.demandId, line.itemBatchId, demand.item_id, line.itemBatchId],
        );
        if (
          integerQuantity(totals!.allocated) + line.assignedQuantity >
          integerQuantity(demand.need_number)
        )
          throw new ProductionDomainError('ALLOCATION_EXCEEDS_DEMAND', '分配数量超过需求剩余缺口');
        if (
          line.assignedQuantity >
          integerQuantity(totals!.on_hand) - integerQuantity(totals!.reserved)
        )
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
      const [[row]] = await connection.query<AllocationRow[]>(
        `${ALLOCATION_SELECT} WHERE a.id=? AND a.production_batch_id=? FOR UPDATE`,
        [allocationId, batchId],
      );
      if (!row) throw new ProductionDomainError('NOT_FOUND', '物料分配不存在');
      requireMaterialAllocationBatchStatus(batch.status, isSupplementDemand(row.demand_type));
      if (row.allocation_status === 'released') return mapAllocation(row);
      if (row.allocation_status !== 'active')
        throw new ProductionDomainError('INVALID_STATE', '当前分配状态不能释放');
      if (integerQuantity(row.outbound_quantity) > 0)
        throw new ProductionDomainError('ALLOCATION_ALREADY_OUTBOUND', '已发生出库的分配不能释放');
      if (integerQuantity(row.pending_outbound_quantity) > 0)
        throw new ProductionDomainError(
          'ALLOCATION_PENDING_OUTBOUND',
          '该分配存在待确认出库单，请先取消相关单据',
        );
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
      requireMaterialOutboundBatchStatus(
        batch.status,
        allocations.every((row) => isSupplementDemand(row.demand_type)),
      );
      const byId = new Map(allocations.map((row) => [String(row.id), row]));
      for (const line of payload.details) {
        const allocation = byId.get(line.allocationId)!;
        if (allocation.allocation_status !== 'active')
          throw new ProductionDomainError('INVALID_STATE', '只有有效分配可以出库');
        if (
          line.outboundQuantity >
          integerQuantity(allocation.assigned_number) -
            integerQuantity(allocation.outbound_quantity) -
            integerQuantity(allocation.pending_outbound_quantity)
        )
          throw new ProductionDomainError(
            'OUTBOUND_EXCEEDS_ALLOCATION',
            '制单数量超过当前可制单数量',
          );
      }
      const outboundNo = `PMO-${Date.now()}-${randomUUID().slice(0, 8)}`;
      const [orderResult] = await connection.execute<ResultSetHeader>(
        `INSERT INTO outbound_order (outbound_no,production_batch_id,work_order_id,status,outbound_at,operator_id,remark,created_by,updated_by) VALUES (?,?,?,'pending_picking',NULL,NULL,?,?,?)`,
        [
          outboundNo,
          batchId,
          batch.work_order_id,
          payload.remark ?? null,
          context.actorId,
          context.actorId,
        ],
      );
      for (const line of payload.details) {
        const allocation = byId.get(line.allocationId)!;
        await connection.execute<ResultSetHeader>(
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
      }
      await this.audit(
        connection,
        context,
        'production-material.outbound.create',
        String(orderResult.insertId),
        null,
        { outboundNo, status: 'pending_picking', detailCount: payload.details.length },
      );
      const current = await findBatch(connection, batchId);
      const outbound = await this.loadOutbound(connection, String(orderResult.insertId));
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
      `${OUTBOUND_SELECT} WHERE o.production_batch_id=? ORDER BY o.created_at DESC,o.id DESC`,
      [batchId],
    );
    return this.loadOutbounds(this.pool, rows);
  }

  async listOutboundOrders(
    query: MaterialOutboundQuery,
  ): Promise<PageResult<MaterialOutboundItem>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const conditions = ['1=1'];
    const values: Array<string | number> = [];
    if (query.keyword?.trim()) {
      const keyword = `%${query.keyword.trim()}%`;
      conditions.push('(o.outbound_no LIKE ? OR b.batch_no LIKE ? OR wo.work_order_no LIKE ?)');
      values.push(keyword, keyword, keyword);
    }
    if (query.status) {
      conditions.push('o.status=?');
      values.push(query.status);
    }
    const where = conditions.join(' AND ');
    const [[count]] = await this.pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total FROM outbound_order o JOIN production_batches b ON b.id=o.production_batch_id JOIN work_orders wo ON wo.id=o.work_order_id WHERE ${where}`,
      values,
    );
    const [rows] = await this.pool.query<OutboundRow[]>(
      `${OUTBOUND_SELECT} WHERE ${where} ORDER BY o.created_at DESC,o.id DESC LIMIT ? OFFSET ?`,
      [...values, pageSize, (page - 1) * pageSize],
    );
    return {
      items: await this.loadOutbounds(this.pool, rows),
      total: Number(count?.total ?? 0),
      page,
      pageSize,
    };
  }

  getOutbound(outboundId: string): Promise<MaterialOutboundItem> {
    return this.loadOutbound(this.pool, outboundId);
  }

  async listOutboundBatchOptions(): Promise<MaterialOutboundBatchOption[]> {
    const [rows] = await this.pool.query<
      (RowDataPacket & {
        id: number;
        batch_no: string;
        work_order_no: string;
        product_code: string;
        product_name: string;
        status: MaterialOutboundBatchOption['batchStatus'];
      })[]
    >(
      `SELECT b.id,b.batch_no,wo.work_order_no,wo.product_code_snapshot product_code,
        wo.product_name_snapshot product_name,b.status
       FROM production_batches b JOIN work_orders wo ON wo.id=b.work_order_id
       WHERE (
         b.status IN ('material_assigned','material_outbound')
         OR (
           b.status='doing'
           AND EXISTS (
             SELECT 1 FROM production_item_allocation a
             JOIN production_item_demand d ON d.id=a.demand_id
             WHERE a.production_batch_id=b.id AND a.allocation_status='active'
               AND d.demand_type IN ('scrap_supplement','material_loss_supplement')
           )
         )
       )
         AND EXISTS (SELECT 1 FROM production_item_allocation a WHERE a.production_batch_id=b.id AND a.allocation_status='active')
       ORDER BY b.created_at DESC,b.id DESC`,
    );
    return rows.map((row) => ({
      productionBatchId: String(row.id),
      batchNo: row.batch_no,
      workOrderNo: row.work_order_no,
      productCode: row.product_code,
      productName: row.product_name,
      batchStatus: row.status,
    }));
  }

  async listOutboundCandidates(batchId: string): Promise<MaterialOutboundCandidateItem[]> {
    const batch = await findBatch(this.pool, batchId);
    const [rows] = await this.pool.query<
      (AllocationRow & { item_code_snapshot: string; product_name_snapshot: string })[]
    >(
      `${ALLOCATION_SELECT.replace(
        'SELECT a.id',
        'SELECT ib.item_code_snapshot,ib.product_name_snapshot,a.id',
      )} WHERE a.production_batch_id=? AND a.allocation_status='active' ORDER BY a.id`,
      [batchId],
    );
    return rows
      .filter((row) => batch.status !== 'doing' || isSupplementDemand(row.demand_type))
      .map((row) => {
        const available = Math.max(
          0,
          integerQuantity(row.assigned_number) -
            integerQuantity(row.outbound_quantity) -
            integerQuantity(row.pending_outbound_quantity),
        );
        return {
          allocationId: String(row.id),
          demandId: String(row.demand_id),
          itemId: String(row.item_id),
          itemCode: row.item_code_snapshot,
          itemName: row.product_name_snapshot,
          itemBatchId: String(row.batch_id),
          batchCode: row.batch_code,
          assignedQuantity: row.assigned_number,
          confirmedOutboundQuantity: row.outbound_quantity,
          pendingOutboundQuantity: row.pending_outbound_quantity,
          availableToOrderQuantity: decimal(available),
          remainingActualOutboundQuantity: decimal(
            Math.max(
              0,
              integerQuantity(row.assigned_number) - integerQuantity(row.outbound_quantity),
            ),
          ),
          unit: row.unit_snapshot,
        };
      })
      .filter((row) => Number(row.availableToOrderQuantity) > 0);
  }

  async confirmOutbound(
    outboundId: string,
    version: number,
    context: CommandContext,
  ): Promise<MaterialOutboundCommandResult> {
    return withTransaction(this.pool, async (connection) => {
      if (!context.actorId) throw new ProductionDomainError('INVALID_INPUT', '缺少当前操作人身份');
      const [[identity]] = await connection.query<
        (RowDataPacket & { production_batch_id: number })[]
      >('SELECT production_batch_id FROM outbound_order WHERE id=?', [outboundId]);
      if (!identity) throw new ProductionDomainError('NOT_FOUND', '生产领料出库单不存在');
      // 所有同批次物料命令统一先锁 production_batches，再锁单据、分配和库存批次，避免交叉等待。
      const lockedBatch = await findBatch(connection, String(identity.production_batch_id), true);
      const [[order]] = await connection.query<
        (RowDataPacket & {
          id: number;
          production_batch_id: number;
          status: string;
          version: number;
        })[]
      >('SELECT id,production_batch_id,status,version FROM outbound_order WHERE id=? FOR UPDATE', [
        outboundId,
      ]);
      if (!order) throw new ProductionDomainError('NOT_FOUND', '生产领料出库单不存在');
      if (String(order.production_batch_id) !== String(identity.production_batch_id))
        throw new ProductionDomainError('CONCURRENT_MODIFICATION', '出库单所属批次已变化');
      if (order.status === 'completed') {
        return {
          productionBatchId: String(order.production_batch_id),
          batchStatus: lockedBatch.status,
          batchVersion: lockedBatch.version,
          outbound: await this.loadOutbound(connection, outboundId),
        };
      }
      if (order.status !== 'pending_picking')
        throw new ProductionDomainError('OUTBOUND_CONFIRM_NOT_ALLOWED', '只有待出库单可以确认');
      if (order.version !== version)
        throw new ProductionDomainError('CONCURRENT_MODIFICATION', '出库单已变化，请刷新后重试');
      await connection.query(
        `SELECT id FROM batch_step_records
         WHERE production_batch_id=? ORDER BY step_order_snapshot,id FOR UPDATE`,
        [order.production_batch_id],
      );
      const [details] = await connection.query<OutboundDetailRow[]>(
        `SELECT od.id,od.outbound_id,od.allocation_id,od.demand_id,od.item_id,od.batch_id,
          ib.batch_code,ib.item_code_snapshot,ib.product_name_snapshot,od.outbound_number,od.unit_snapshot,
          NULL inventory_transaction_id
         FROM outbound_detail od JOIN item_batch ib ON ib.id=od.batch_id
         WHERE od.outbound_id=? ORDER BY od.id FOR UPDATE`,
        [outboundId],
      );
      if (details.length === 0)
        throw new ProductionDomainError('INVALID_STATE', '出库单没有可确认明细');
      const allocationIds = [...new Set(details.map((row) => String(row.allocation_id)))].sort(
        bigintCompare,
      );
      await lockIds(connection, 'production_item_allocation', allocationIds);
      const [allocations] = await connection.query<AllocationRow[]>(
        `${ALLOCATION_SELECT} WHERE a.id IN (${placeholders(allocationIds)}) ORDER BY a.id`,
        allocationIds,
      );
      const byAllocation = new Map(allocations.map((row) => [String(row.id), row]));
      const itemBatchIds = [...new Set(details.map((row) => String(row.batch_id)))].sort(
        bigintCompare,
      );
      await lockIds(connection, 'item_batch', itemBatchIds);
      const requestedByBatch = new Map<string, { itemId: number; quantity: number }>();
      for (const detail of details) {
        const allocation = byAllocation.get(String(detail.allocation_id));
        if (
          !allocation ||
          allocation.allocation_status !== 'active' ||
          String(allocation.production_batch_id) !== String(order.production_batch_id)
        )
          throw new ProductionDomainError('OUTBOUND_ALLOCATION_CHANGED', '出库单对应分配已失效');
        if (
          integerQuantity(allocation.outbound_quantity) + integerQuantity(detail.outbound_number) >
          integerQuantity(allocation.assigned_number)
        )
          throw new ProductionDomainError('OUTBOUND_EXCEEDS_ALLOCATION', '出库数量超过分配剩余量');
        const key = String(detail.batch_id);
        const current = requestedByBatch.get(key);
        requestedByBatch.set(key, {
          itemId: detail.item_id,
          quantity: (current?.quantity ?? 0) + integerQuantity(detail.outbound_number),
        });
      }
      for (const [batchId, requested] of requestedByBatch) {
        const [[stock]] = await connection.query<(RowDataPacket & { quantity: string })[]>(
          "SELECT COALESCE(SUM(quantity),0) quantity FROM inventory_transaction WHERE batch_id=? AND item_id=? AND stock_status='available'",
          [batchId, requested.itemId],
        );
        if (requested.quantity > integerQuantity(stock?.quantity ?? 0))
          throw new ProductionDomainError(
            'INSUFFICIENT_AVAILABLE_STOCK',
            '库存账面可用数量不足，整单未扣减',
          );
      }
      for (const detail of details) {
        await connection.execute(
          `INSERT INTO inventory_transaction (item_id,batch_id,transaction_type,quantity,unit_snapshot,stock_status,reference_type,reference_detail_id,idempotency_key,created_by)
           VALUES (?,?,'production_material_outbound',? * -1,?,'available','outbound_detail',?,?,?)`,
          [
            detail.item_id,
            detail.batch_id,
            detail.outbound_number,
            detail.unit_snapshot,
            detail.id,
            `PMO:${outboundId}:${detail.id}`,
            context.actorId,
          ],
        );
      }
      const [updated] = await connection.execute<ResultSetHeader>(
        `UPDATE outbound_order SET status='completed',outbound_at=NOW(),operator_id=?,version=version+1,updated_by=?
         WHERE id=? AND status='pending_picking' AND version=?`,
        [context.actorId, context.actorId, outboundId, version],
      );
      if (updated.affectedRows !== 1)
        throw new ProductionDomainError('CONCURRENT_MODIFICATION', '出库单已变化，请刷新后重试');
      if (await allDemandsOutbound(connection, String(order.production_batch_id)))
        await connection.execute(
          "UPDATE production_batches SET status='material_outbound',version=version+1,updated_by=? WHERE id=? AND status='material_assigned'",
          [context.actorId, order.production_batch_id],
        );
      const supplementFulfillment = await fulfillReadySupplements(
        connection,
        String(order.production_batch_id),
        lockedBatch.planned_quantity,
        context.actorId,
      );
      await this.audit(
        connection,
        context,
        'production-material.outbound.confirm',
        outboundId,
        { status: 'pending_picking', version },
        {
          status: 'completed',
          version: version + 1,
          transactionCount: details.length,
          fulfilledSupplementIds: supplementFulfillment.fulfilledSupplementIds,
          reopenedStepIds: supplementFulfillment.reopenedStepIds,
        },
      );
      const batch = await findBatch(connection, String(order.production_batch_id));
      return {
        productionBatchId: String(order.production_batch_id),
        batchStatus: batch.status,
        batchVersion: batch.version,
        outbound: await this.loadOutbound(connection, outboundId),
      };
    });
  }

  async cancelOutbound(
    outboundId: string,
    version: number,
    reason: string,
    context: CommandContext,
  ): Promise<MaterialOutboundItem> {
    return withTransaction(this.pool, async (connection) => {
      const [[order]] = await connection.query<
        (RowDataPacket & { status: string; version: number })[]
      >('SELECT status,version FROM outbound_order WHERE id=? FOR UPDATE', [outboundId]);
      if (!order) throw new ProductionDomainError('NOT_FOUND', '生产领料出库单不存在');
      if (order.status === 'cancelled') return this.loadOutbound(connection, outboundId);
      if (order.status !== 'pending_picking')
        throw new ProductionDomainError('OUTBOUND_CANCEL_NOT_ALLOWED', '已确认出库单不能取消');
      if (order.version !== version)
        throw new ProductionDomainError('CONCURRENT_MODIFICATION', '出库单已变化，请刷新后重试');
      const [updated] = await connection.execute<ResultSetHeader>(
        "UPDATE outbound_order SET status='cancelled',cancel_source='manual',cancel_reason=?,cancelled_by=?,cancelled_at=NOW(),version=version+1,updated_by=? WHERE id=? AND status='pending_picking' AND version=?",
        [reason, context.actorId, context.actorId, outboundId, version],
      );
      if (updated.affectedRows !== 1)
        throw new ProductionDomainError('CONCURRENT_MODIFICATION', '出库单已变化，请刷新后重试');
      await this.audit(
        connection,
        context,
        'production-material.outbound.cancel',
        outboundId,
        { status: 'pending_picking', version },
        { status: 'cancelled', cancelSource: 'manual', reason, version: version + 1 },
      );
      return this.loadOutbound(connection, outboundId);
    });
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
  private async loadOutbound(
    db: Pool | PoolConnection,
    id: string,
    known?: OutboundRow,
  ): Promise<MaterialOutboundItem> {
    let row = known;
    if (!row) {
      const [[found]] = await db.query<OutboundRow[]>(`${OUTBOUND_SELECT} WHERE o.id=?`, [id]);
      row = found;
    }
    if (!row) throw new ProductionDomainError('NOT_FOUND', '生产领料出库单不存在');
    return (await this.loadOutbounds(db, [row]))[0]!;
  }
  private async loadOutbounds(
    db: Pool | PoolConnection,
    rows: OutboundRow[],
  ): Promise<MaterialOutboundItem[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => String(row.id));
    const [details] = await db.query<OutboundDetailRow[]>(
      `SELECT od.id,od.outbound_id,od.allocation_id,od.demand_id,od.item_id,od.batch_id,ib.batch_code,
        ib.item_code_snapshot,ib.product_name_snapshot,od.outbound_number,od.unit_snapshot,it.id inventory_transaction_id
       FROM outbound_detail od JOIN item_batch ib ON ib.id=od.batch_id
       LEFT JOIN inventory_transaction it ON it.reference_type='outbound_detail'
         AND it.reference_detail_id=od.id AND it.transaction_type='production_material_outbound'
       WHERE od.outbound_id IN (${placeholders(ids)}) ORDER BY od.outbound_id,od.id`,
      ids,
    );
    const detailsByOutbound = new Map<string, OutboundDetailRow[]>();
    for (const detail of details) {
      const key = String(detail.outbound_id);
      const values = detailsByOutbound.get(key) ?? [];
      values.push(detail);
      detailsByOutbound.set(key, values);
    }
    return rows.map((row) => this.mapOutbound(row, detailsByOutbound.get(String(row.id)) ?? []));
  }
  private mapOutbound(row: OutboundRow, details: OutboundDetailRow[]): MaterialOutboundItem {
    return {
      outboundId: String(row.id),
      outboundNo: row.outbound_no,
      productionBatchId: String(row.production_batch_id),
      batchNo: row.batch_no,
      workOrderId: String(row.work_order_id),
      workOrderNo: row.work_order_no,
      productId: String(row.product_id),
      productCode: row.product_code,
      productName: row.product_name,
      status: row.status,
      outboundAt: row.outbound_at ? toBeijingISOString(row.outbound_at) : null,
      operatorId: row.operator_id === null ? null : String(row.operator_id),
      operatorName: null,
      createdById: row.created_by === null ? null : String(row.created_by),
      createdByName: null,
      createdAt: toBeijingISOString(row.created_at),
      version: row.version,
      remark: row.remark,
      cancelSource: row.cancel_source,
      cancelReason: row.cancel_reason,
      cancelledById: row.cancelled_by === null ? null : String(row.cancelled_by),
      cancelledByName: null,
      cancelledAt: row.cancelled_at ? toBeijingISOString(row.cancelled_at) : null,
      quantitySummary: summarizeQuantities(details),
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
        inventoryTransactionId:
          detail.inventory_transaction_id === null ? null : String(detail.inventory_transaction_id),
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
const isSupplementDemand = (value: string) =>
  value === 'scrap_supplement' || value === 'material_loss_supplement';
const allDemandsOutbound = async (db: PoolConnection, batchId: string) => {
  const [[row]] = await db.query<(RowDataPacket & { missing: number })[]>(
    `SELECT COUNT(*) missing FROM production_item_demand d WHERE d.production_batch_id=? AND d.business_status='active' AND COALESCE((SELECT SUM(od.outbound_number) FROM outbound_detail od JOIN outbound_order oo ON oo.id=od.outbound_id WHERE od.demand_id=d.id AND oo.status='completed'),0)<d.need_number`,
    [batchId],
  );
  return Number(row?.missing ?? 1) === 0;
};

const OUTBOUND_SELECT = `SELECT o.id,o.outbound_no,o.production_batch_id,b.batch_no,o.work_order_id,
  wo.work_order_no,b.product_id,wo.product_code_snapshot product_code,wo.product_name_snapshot product_name,
  o.status,o.outbound_at,o.operator_id,o.created_by,o.created_at,o.version,o.remark,
  o.cancel_source,o.cancel_reason,o.cancelled_by,o.cancelled_at
  FROM outbound_order o JOIN production_batches b ON b.id=o.production_batch_id
  JOIN work_orders wo ON wo.id=o.work_order_id`;

const summarizeQuantities = (details: OutboundDetailRow[]) => {
  const byUnit = new Map<string, number>();
  for (const detail of details)
    byUnit.set(
      detail.unit_snapshot,
      (byUnit.get(detail.unit_snapshot) ?? 0) + integerQuantity(detail.outbound_number),
    );
  return [...byUnit.entries()].map(([unit, quantity]) => ({ unit, quantity: decimal(quantity) }));
};
