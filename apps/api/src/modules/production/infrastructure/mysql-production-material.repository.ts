import { MaterialVariantQuery, ProductInventoryEligibility } from '../../product/public.js';
import { AVAILABLE_MATERIAL_BATCHES_SQL } from './queries/material-available-batches.sql.js';
import { InventoryStockCommand } from '../../inventory/public.js';
import { Inject, Injectable } from '@nestjs/common';
import { withTransaction } from '@company/database';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  AvailableItemBatchItem,
  CreateMaterialAllocationsPayload,
  MaterialAllocationCommandResult,
  ProductionMaterialAllocationItem,
  ProductionMaterialDemandItem,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import { toDateOnlyString } from '../../../common/time/date-time.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { ProductionMaterialRepository } from '../application/ports/production-material.repository.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { integerQuantity } from '../domain/integer-quantity.js';
import { requireMaterialAllocationBatchStatus } from '../domain/production-material.policy.js';
import { requireBatchTransition } from '../domain/production-status.policy.js';
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
} from './mysql-production-material.mapper.js';
import { areAllActiveDemandsAllocated, lockIds } from './mysql-production-material-persistence.js';
import { findBatch } from './mysql-production.shared.js';

@Injectable()
export class MysqlProductionMaterialRepository extends ProductionMaterialRepository {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly inventory: InventoryStockCommand,
    private readonly variants: MaterialVariantQuery,
    private readonly productEligibility: ProductInventoryEligibility,
  ) {
    super();
  }

  async hasGeneratedNormalDemands(batchId: string): Promise<boolean> {
    await findBatch(this.pool, batchId);
    const [[row]] = await this.pool.query<(RowDataPacket & { has_normal_demands: number })[]>(
      `SELECT EXISTS(
         SELECT 1 FROM production_item_demand
         WHERE production_batch_id=? AND demand_type='normal'
       ) AS has_normal_demands`,
      [batchId],
    );
    return Number(row?.has_normal_demands ?? 0) === 1;
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
    await this.decorateAllocations(allocations);
    const byDemand = new Map<string, ProductionMaterialAllocationItem[]>();
    for (const row of allocations) {
      const key = String(row.demand_id);
      byDemand.set(key, [...(byDemand.get(key) ?? []), mapAllocation(row)]);
    }
    return rows.map((row) => mapDemand(row, byDemand.get(String(row.id)) ?? []));
  }

  async listAvailableItemBatches(demandId: string): Promise<AvailableItemBatchItem[]> {
    const [[demand]] = await this.pool.query<
      (RowDataPacket & { item_id: number; material_variant_id: number })[]
    >(
      "SELECT item_id,material_variant_id FROM production_item_demand WHERE id=? AND business_status='active' AND pending_correction_id IS NULL",
      [demandId],
    );
    if (!demand) throw new ProductionDomainError('NOT_FOUND', '有效物料需求不存在');
    const enabled = await this.variants.listEnabledByMaterials([String(demand.item_id)]);
    if (!enabled.some((row) => row.id === String(demand.material_variant_id))) return [];
    const [rows] = await this.pool.query<AvailableRow[]>(AVAILABLE_MATERIAL_BATCHES_SQL, [
      demand.item_id,
      demand.material_variant_id,
    ]);
    return rows.map((row) => ({
      itemBatchId: String(row.id),
      itemId: String(row.item_id),
      materialVariantId: String(row.material_variant_id),
      materialVariantCode: row.material_variant_code_snapshot,
      itemCode: row.item_code_snapshot,
      itemName: row.item_name,
      batchCode: row.batch_code,
      unit: row.unit_snapshot,
      sourceType: row.source_type,
      provider: row.provider,
      productionDate: toDateOnlyString(row.production_date),
      onHandAvailableQuantity: String(row.on_hand),
      reservedQuantity: String(row.reserved),
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
      if (new Set(payload.allocations.map((line) => line.demandId)).size !== 1)
        throw new ProductionDomainError('INVALID_INPUT', '一次只能为一条物料需求分配库存');
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
      const selectedStocks = await this.inventory.materialBatchReferences(batchIds);
      const eligibility = await this.productEligibility.requireProductionIssuableReferences({
        references: selectedStocks.map((row) => ({
          itemId: row.itemId,
          materialVariantId: row.materialVariantId,
        })),
      });
      if (eligibility.status !== 'success')
        throw new ProductionDomainError(
          eligibility.status === 'not-found' ? 'NOT_FOUND' : 'INVALID_INPUT',
          eligibility.message,
        );
      const lockedStocks = new Map(
        (await this.inventory.lockMaterialBatches(batchIds)).map((row) => [row.id, row]),
      );
      await lockIds(connection, 'production_item_demand', demandIds);
      requireMaterialAllocationBatchStatus(batch.status);
      const inserted: string[] = [];
      for (const line of payload.allocations) {
        const [[demand]] = await connection.query<
          (RowDataPacket & {
            production_batch_id: number;
            item_id: number;
            material_variant_id: number;
            unit_snapshot: string;
            remaining_number: string;
            business_status: string;
            pending_correction_id: number | null;
          })[]
        >(
          'SELECT production_batch_id,item_id,material_variant_id,unit_snapshot,remaining_number,business_status,pending_correction_id FROM production_item_demand WHERE id=? FOR UPDATE',
          [line.demandId],
        );
        const stockBatch = lockedStocks.get(line.itemBatchId);
        if (!demand || String(demand.production_batch_id) !== batchId)
          throw new ProductionDomainError('NOT_FOUND', '物料需求不属于当前生产批次');
        if (demand.business_status !== 'active' || demand.pending_correction_id !== null)
          throw new ProductionDomainError('INVALID_STATE', '只有有效物料需求可以分配');
        if (
          !stockBatch ||
          stockBatch.itemId !== String(demand.item_id) ||
          stockBatch.materialVariantId !== String(demand.material_variant_id) ||
          stockBatch.batchStatus !== 'available'
        )
          throw new ProductionDomainError('INVALID_INPUT', '库存批次不可用或物料不匹配');
        const [currentAllocations] = await connection.query<
          (RowDataPacket & {
            id: number | string;
            demand_id: number | string;
            batch_id: number | string;
            assigned_number: string;
          })[]
        >(
          `SELECT id,demand_id,batch_id,assigned_number FROM production_item_allocation
           WHERE allocation_status NOT IN ('released','cancelled')
             AND (demand_id=? OR (batch_id=? AND item_id=? AND material_variant_id=?))
           ORDER BY id FOR SHARE`,
          [line.demandId, line.itemBatchId, demand.item_id, demand.material_variant_id],
        );
        const allocationIds = currentAllocations.map((row) => String(row.id));
        const issuedByAllocation = new Map<string, number>();
        if (allocationIds.length) {
          const [currentIssues] = await connection.query<
            (RowDataPacket & { allocation_id: number | string; outbound_number: string })[]
          >(
            `SELECT od.allocation_id,od.outbound_number FROM outbound_detail od
             JOIN outbound_order oo ON oo.id=od.outbound_id
             WHERE od.allocation_id IN (${placeholders(allocationIds)}) AND oo.status='completed'
             ORDER BY od.id FOR SHARE`,
            allocationIds,
          );
          for (const issue of currentIssues) {
            const id = String(issue.allocation_id);
            issuedByAllocation.set(
              id,
              (issuedByAllocation.get(id) ?? 0) + integerQuantity(issue.outbound_number),
            );
          }
        }
        let remainingAllocated = 0;
        let reserved = 0;
        for (const allocation of currentAllocations) {
          const assigned = integerQuantity(allocation.assigned_number);
          const unissued = Math.max(
            0,
            assigned - (issuedByAllocation.get(String(allocation.id)) ?? 0),
          );
          if (String(allocation.demand_id) === line.demandId) remainingAllocated += unissued;
          if (String(allocation.batch_id) === line.itemBatchId) reserved += unissued;
        }
        if (remainingAllocated + line.assignedQuantity > integerQuantity(demand.remaining_number))
          throw new ProductionDomainError('ALLOCATION_EXCEEDS_DEMAND', '分配数量超过需求剩余缺口');
        if (line.assignedQuantity > integerQuantity(stockBatch.availableQuantity) - reserved)
          throw new ProductionDomainError('INSUFFICIENT_AVAILABLE_STOCK', '库存批次可分配数量不足');
        const [result] = await connection.execute<ResultSetHeader>(
          `INSERT INTO production_item_allocation (demand_id,production_batch_id,item_id,material_variant_id,batch_id,assigned_number,unit_snapshot,remark,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [
            line.demandId,
            batchId,
            demand.item_id,
            demand.material_variant_id,
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
      const complete = await areAllActiveDemandsAllocated(connection, batchId, this.variants);
      if (complete && batch.status === 'material_pending') {
        requireBatchTransition(batch.status, 'material_assigned');
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
      if (row.demand_business_status !== 'active' || row.pending_correction_id !== null)
        throw new ProductionDomainError('INVALID_STATE', '该需求已结束或更正审批中，不能释放分配');
      requireMaterialAllocationBatchStatus(batch.status);
      if (row.allocation_status === 'released') {
        await this.decorateAllocations([row]);
        return mapAllocation(row);
      }
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
      if (
        !(await areAllActiveDemandsAllocated(connection, batchId, this.variants)) &&
        batch.status === 'material_assigned'
      ) {
        requireBatchTransition(batch.status, 'material_pending');
        await connection.execute(
          "UPDATE production_batches SET status='material_pending',version=version+1,updated_by=? WHERE id=?",
          [context.actorId, batchId],
        );
      }
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

  private async getAllocations(
    db: Pool | PoolConnection,
    ids: string[],
  ): Promise<ProductionMaterialAllocationItem[]> {
    if (ids.length === 0) return [];
    const [rows] = await db.query<AllocationRow[]>(
      `${ALLOCATION_SELECT} WHERE a.id IN (${placeholders(ids)}) ORDER BY a.id`,
      ids,
    );
    await this.decorateAllocations(rows);
    return rows.map(mapAllocation);
  }
  private async decorateAllocations(rows: AllocationRow[]): Promise<void> {
    const references = new Map(
      (
        await this.inventory.materialBatchReferences([
          ...new Set(rows.map((row) => String(row.batch_id))),
        ])
      ).map((row) => [row.id, row]),
    );
    for (const row of rows) {
      const reference = references.get(String(row.batch_id));
      if (!reference) throw new ProductionDomainError('NOT_FOUND', '库存批次不存在');
      row.batch_code = reference.batchCode;
      row.material_variant_code_snapshot = reference.materialVariantCode;
    }
  }
  private audit(
    connection: PoolConnection,
    context: CommandContext,
    action: string,
    targetId: string,
    beforeData: unknown,
    afterData: unknown,
    targetType?: string,
  ): Promise<void> {
    return writeTransactionalAudit(connection, {
      logType: 'business',
      module: 'production',
      action,
      userId: context.actorId,
      targetId,
      targetType:
        targetType ??
        (action.includes('outbound') ? 'outbound_order' : 'production_item_allocation'),
      result: 'success',
      beforeData,
      afterData,
      requestId: context.requestId,
      ip: context.ip,
      userAgent: context.userAgent,
    });
  }
}
