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
  ShortBatchAuthorizationPreview,
  ShortBatchAuthorizationPreviewLine,
  ShortBatchAuthorizationResult,
  CloseRemainingMaterialDemandsResult,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import { toBeijingISOString, toDateOnlyString } from '../../../common/time/date-time.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { ProductionMaterialRepository } from '../application/ports/production-material.repository.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { integerQuantity } from '../domain/integer-quantity.js';
import { evaluateMaterialOutboundEligibility } from '../domain/production-material-outbound-eligibility.js';
import {
  requireMaterialAllocationBatchStatus,
  requireMaterialOutboundBatchStatus,
} from '../domain/production-material.policy.js';
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
  type OutboundDetailRow,
  type OutboundRow,
} from './mysql-production-material.mapper.js';
import { activeDemandAllocationGapExistsSql } from './mysql-production-material.sql.js';
import { findBatch } from './mysql-production.shared.js';
import { mysqlProductionDemandPlanWriter } from './mysql-production-demand-plan.writer.js';
import { fulfillReadySupplements } from './mysql-production-supplement-activation.js';
import {
  getNetConfirmedMaterialOutboundQuantity,
  hasConsumedShortBatchAuthorization,
} from './mysql-production-short-batch.js';

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
      "SELECT item_id,material_variant_id FROM production_item_demand WHERE id=? AND business_status='active'",
      [demandId],
    );
    if (!demand) throw new ProductionDomainError('NOT_FOUND', '有效物料需求不存在');
    const [rows] = await this.pool.query<AvailableRow[]>(
      `SELECT ib.id,ib.item_id,ib.material_variant_id,ib.material_variant_code_snapshot,ib.item_code_snapshot,ib.product_name_snapshot,ib.batch_code,ib.unit_snapshot,ib.source_type,ib.provider,ib.production_date,
       COALESCE(SUM(CASE WHEN it.stock_status='available' THEN it.quantity ELSE 0 END),0) on_hand,
       COALESCE((SELECT SUM(GREATEST(a.assigned_number-COALESCE((SELECT SUM(od.outbound_number) FROM outbound_detail od JOIN outbound_order oo ON oo.id=od.outbound_id WHERE od.allocation_id=a.id AND oo.status='completed'),0),0)) FROM production_item_allocation a WHERE a.batch_id=ib.id AND a.allocation_status NOT IN ('released','cancelled')),0) reserved
       FROM item_batch ib LEFT JOIN inventory_transaction it ON it.batch_id=ib.id AND it.item_id=ib.item_id AND it.material_variant_id=ib.material_variant_id
       WHERE ib.item_id=? AND ib.material_variant_id=? AND ib.batch_status='available'
       GROUP BY ib.id
       HAVING on_hand > 0
       ORDER BY ib.id`,
      [demand.item_id, demand.material_variant_id],
    );
    return rows.map((row) => ({
      itemBatchId: String(row.id),
      itemId: String(row.item_id),
      materialVariantId: String(row.material_variant_id),
      materialVariantCode: row.material_variant_code_snapshot,
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

  async getShortBatchAuthorizationPreview(
    batchId: string,
  ): Promise<ShortBatchAuthorizationPreview> {
    const batch = await findBatch(this.pool, batchId);
    return buildShortBatchAuthorizationPreview(this.pool, batch);
  }

  async authorizeShortBatch(
    batchId: string,
    version: number,
    reason: string,
    context: CommandContext,
  ): Promise<ShortBatchAuthorizationResult> {
    return withTransaction(this.pool, async (connection) => {
      if (!context.actorId) throw new ProductionDomainError('INVALID_INPUT', '缺少当前操作人身份');
      const batch = await findBatch(connection, batchId, true);
      const materialPlanVersion = batch.material_plan_version;
      if (batch.version !== version)
        throw new ProductionDomainError(
          'CONCURRENT_MODIFICATION',
          '生产任务已变化，请刷新缺口后重新授权',
        );
      await connection.query(
        `SELECT id FROM production_item_demand
         WHERE production_batch_id=? ORDER BY id FOR UPDATE`,
        [batchId],
      );
      await connection.query(
        `SELECT id FROM production_item_allocation
         WHERE production_batch_id=? ORDER BY id FOR UPDATE`,
        [batchId],
      );
      const preview = await buildShortBatchAuthorizationPreview(connection, batch);
      if (
        !['authorize', 'reauthorize', 'adjust'].includes(preview.authorizationAction) ||
        preview.blockedReason !== null
      )
        throw new ProductionDomainError(
          'SHORT_BATCH_AUTHORIZATION_NOT_ALLOWED',
          preview.blockedReason ?? '当前任务不允许短批授权',
        );
      await connection.execute(
        `UPDATE production_short_batch_authorization
         SET status='superseded',version=version+1
         WHERE production_batch_id=? AND status='active'`,
        [batchId],
      );
      const [inserted] = await connection.execute<ResultSetHeader>(
        `INSERT INTO production_short_batch_authorization
         (production_batch_id,material_plan_version,status,reason,authorized_by)
         VALUES (?,?,'active',?,?)`,
        [batchId, materialPlanVersion, reason, context.actorId],
      );
      for (const line of preview.lines) {
        await connection.execute(
          `INSERT INTO production_short_batch_authorization_detail
           (authorization_id,demand_id,item_id,material_variant_id,demand_quantity_snapshot,
            confirmed_outbound_quantity_snapshot,expected_outbound_quantity_snapshot,
            authorized_remaining_quantity,unit_snapshot)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [
            inserted.insertId,
            line.demandId,
            line.itemId,
            line.materialVariantId,
            integerQuantity(line.demandQuantity),
            integerQuantity(line.confirmedOutboundQuantity),
            integerQuantity(line.expectedOutboundQuantity),
            integerQuantity(line.authorizedRemainingQuantity),
            line.unit,
          ],
        );
      }
      const [batchUpdated] = await connection.execute<ResultSetHeader>(
        `UPDATE production_batches SET version=version+1,updated_by=?
         WHERE id=? AND version=?`,
        [context.actorId, batchId, version],
      );
      if (batchUpdated.affectedRows !== 1)
        throw new ProductionDomainError('CONCURRENT_MODIFICATION', '生产任务已变化，请重新授权');
      await this.audit(
        connection,
        context,
        'production-material.short-batch-authorize',
        String(inserted.insertId),
        null,
        {
          productionBatchId: batchId,
          materialPlanVersion,
          reason,
          allowedShortages: preview.lines.map((line) => ({
            demandId: line.demandId,
            authorizedRemainingQuantity: line.authorizedRemainingQuantity,
          })),
        },
        'production_short_batch_authorization',
      );
      const [[authorization]] = await connection.query<(RowDataPacket & { authorized_at: Date })[]>(
        'SELECT authorized_at FROM production_short_batch_authorization WHERE id=?',
        [inserted.insertId],
      );
      return {
        authorizationId: String(inserted.insertId),
        productionBatchId: batchId,
        batchStatus: batch.status,
        batchVersion: version + 1,
        materialPlanVersion,
        status: 'active',
        reason,
        authorizedById: context.actorId,
        authorizedAt: toBeijingISOString(authorization!.authorized_at),
        lines: preview.lines,
      };
    });
  }

  async closeRemainingDemands(
    batchId: string,
    version: number,
    reason: string,
    context: CommandContext,
  ): Promise<CloseRemainingMaterialDemandsResult> {
    return withTransaction(this.pool, async (connection) => {
      if (!context.actorId) throw new ProductionDomainError('INVALID_INPUT', '缺少当前操作人身份');
      const batch = await findBatch(connection, batchId, true);
      if (batch.status !== 'doing')
        throw new ProductionDomainError(
          'INVALID_STATE',
          '只有已经开工的短批任务可以关闭剩余物料需求',
        );
      const [[consumedAuthorization]] = await connection.query<(RowDataPacket & { id: number })[]>(
        `SELECT id FROM production_short_batch_authorization
         WHERE production_batch_id=? AND status='consumed'
         ORDER BY id DESC LIMIT 1 FOR UPDATE`,
        [batchId],
      );
      if (!consumedAuthorization)
        throw new ProductionDomainError(
          'INVALID_STATE',
          '只有使用短批授权开工的任务可以关闭剩余物料需求',
        );
      if (batch.version !== version)
        throw new ProductionDomainError('CONCURRENT_MODIFICATION', '生产任务已变化，请刷新后重试');
      const [demands] = await connection.query<(RowDataPacket & { id: number })[]>(
        `SELECT id FROM production_item_demand
         WHERE production_batch_id=? AND business_status='active'
         ORDER BY id FOR UPDATE`,
        [batchId],
      );
      if (demands.length === 0)
        return {
          productionBatchId: batchId,
          batchStatus: batch.status,
          batchVersion: batch.version,
          materialPlanVersion: batch.material_plan_version,
          cancelledDemandCount: 0,
          releasedAllocationCount: 0,
        };
      const demandIds = demands.map((row) => String(row.id));
      const [[pending]] = await connection.query<(RowDataPacket & { count: number })[]>(
        `SELECT COUNT(*) count FROM outbound_detail detail
         JOIN outbound_order outbound ON outbound.id=detail.outbound_id
         WHERE detail.demand_id IN (${placeholders(demandIds)})
           AND outbound.status='pending_picking'`,
        demandIds,
      );
      if (Number(pending?.count ?? 0) > 0)
        throw new ProductionDomainError(
          'INVALID_STATE',
          '剩余需求存在待确认出库单，请先取消相关单据',
        );
      const [released] = await connection.execute<ResultSetHeader>(
        `UPDATE production_item_allocation
         SET allocation_status='cancelled',version=version+1,updated_by=?
         WHERE demand_id IN (${placeholders(demandIds)}) AND allocation_status='active'
           AND assigned_number>COALESCE((
             SELECT SUM(detail.outbound_number)
             FROM outbound_detail detail
             JOIN outbound_order outbound ON outbound.id=detail.outbound_id
             WHERE detail.allocation_id=production_item_allocation.id
               AND outbound.status='completed'
           ),0)`,
        [context.actorId, ...demandIds],
      );
      const cancelledDemandCount = await mysqlProductionDemandPlanWriter.cancelRemainingDemands(
        connection,
        { batchId, actorId: context.actorId, reason, expectedBatchVersion: version },
      );
      await this.audit(
        connection,
        context,
        'production-material.remaining-demands.close',
        batchId,
        { activeDemandCount: demands.length },
        {
          reason,
          cancelledDemandCount,
          releasedAllocationCount: released.affectedRows,
          materialPlanVersion: batch.material_plan_version + 1,
          shortBatchAuthorizationId: String(consumedAuthorization.id),
        },
        'production_batches',
      );
      return {
        productionBatchId: batchId,
        batchStatus: batch.status,
        batchVersion: version + 1,
        materialPlanVersion: batch.material_plan_version + 1,
        cancelledDemandCount,
        releasedAllocationCount: released.affectedRows,
      };
    });
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
      await lockIds(connection, 'item_batch', batchIds);
      await lockIds(connection, 'production_item_demand', demandIds);
      const [demandTypes] = await connection.query<
        (RowDataPacket & { id: number; demand_type: string })[]
      >(
        `SELECT id,demand_type FROM production_item_demand WHERE id IN (${placeholders(demandIds)}) ORDER BY id`,
        demandIds,
      );
      const supplementOnly =
        demandTypes.length === demandIds.length &&
        demandTypes.every((row) => isSupplementDemand(row.demand_type));
      requireMaterialAllocationBatchStatus(
        batch.status,
        supplementOnly,
        batch.status === 'doing' && !supplementOnly
          ? await hasConsumedShortBatchAuthorization(connection, batchId)
          : false,
      );
      const inserted: string[] = [];
      for (const line of payload.allocations) {
        const [[demand]] = await connection.query<
          (RowDataPacket & {
            production_batch_id: number;
            item_id: number;
            material_variant_id: number;
            unit_snapshot: string;
            need_number: string;
            business_status: string;
          })[]
        >(
          'SELECT production_batch_id,item_id,material_variant_id,unit_snapshot,need_number,business_status FROM production_item_demand WHERE id=?',
          [line.demandId],
        );
        const [[stockBatch]] = await connection.query<
          (RowDataPacket & {
            item_id: number;
            material_variant_id: number;
            batch_status: string;
          })[]
        >('SELECT item_id,material_variant_id,batch_status FROM item_batch WHERE id=?', [
          line.itemBatchId,
        ]);
        if (!demand || String(demand.production_batch_id) !== batchId)
          throw new ProductionDomainError('NOT_FOUND', '物料需求不属于当前生产批次');
        if (demand.business_status !== 'active')
          throw new ProductionDomainError('INVALID_STATE', '只有有效物料需求可以分配');
        if (
          !stockBatch ||
          stockBatch.item_id !== demand.item_id ||
          stockBatch.material_variant_id !== demand.material_variant_id ||
          stockBatch.batch_status !== 'available'
        )
          throw new ProductionDomainError('INVALID_INPUT', '库存批次不可用或物料不匹配');
        const [[totals]] = await connection.query<
          (RowDataPacket & { allocated: string; on_hand: string; reserved: string })[]
        >(
          `SELECT
           COALESCE((SELECT SUM(GREATEST(allocation.assigned_number-COALESCE((
             SELECT SUM(return_detail.return_number)
             FROM return_detail JOIN return_order ON return_order.id=return_detail.return_id
             WHERE return_detail.allocation_id=allocation.id
               AND return_order.status='returned' AND return_detail.release_after_return=1
           ),0),0)) FROM production_item_allocation allocation
             WHERE allocation.demand_id=? AND allocation.allocation_status NOT IN ('released','cancelled')),0) allocated,
           COALESCE((SELECT SUM(quantity) FROM inventory_transaction WHERE batch_id=? AND item_id=? AND material_variant_id=? AND stock_status='available'),0) on_hand,
           COALESCE((SELECT SUM(GREATEST(a.assigned_number-COALESCE((SELECT SUM(od.outbound_number) FROM outbound_detail od JOIN outbound_order oo ON oo.id=od.outbound_id WHERE od.allocation_id=a.id AND oo.status='completed'),0),0)) FROM production_item_allocation a WHERE a.batch_id=? AND a.item_id=? AND a.material_variant_id=? AND a.allocation_status NOT IN ('released','cancelled')),0) reserved`,
          [
            line.demandId,
            line.itemBatchId,
            demand.item_id,
            demand.material_variant_id,
            line.itemBatchId,
            demand.item_id,
            demand.material_variant_id,
          ],
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
      const complete = await areAllActiveDemandsAllocated(connection, batchId);
      if (complete && batch.status === 'material_pending') {
        requireBatchTransition(batch.status, 'material_assigned');
        await connection.execute(
          "UPDATE production_batches SET status='material_assigned',version=version+1,updated_by=? WHERE id=?",
          [context.actorId, batchId],
        );
        await connection.execute(
          `UPDATE production_short_batch_authorization
           SET status='superseded',version=version+1
           WHERE production_batch_id=? AND status='active'`,
          [batchId],
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
      const supplementDemand = isSupplementDemand(row.demand_type);
      requireMaterialAllocationBatchStatus(
        batch.status,
        supplementDemand,
        batch.status === 'doing' && !supplementDemand
          ? await hasConsumedShortBatchAuthorization(connection, batchId)
          : false,
      );
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
      if (
        !(await areAllActiveDemandsAllocated(connection, batchId)) &&
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
        `${ALLOCATION_SELECT} WHERE a.id IN (${placeholders(allocationIds)}) AND a.production_batch_id=? AND d.business_status='active' ORDER BY a.id`,
        [...allocationIds, batchId],
      );
      if (allocations.length !== allocationIds.length)
        throw new ProductionDomainError('NOT_FOUND', '出库分配不存在或不属于当前批次');
      const allActiveDemandsAllocated = await areAllActiveDemandsAllocated(connection, batchId);
      const effectiveShortBatchAuthorizationId =
        batch.status === 'material_pending' || batch.status === 'material_partially_outbound'
          ? await findEffectiveShortBatchAuthorizationId(
              connection,
              batchId,
              batch.material_plan_version,
            )
          : null;
      const ordinaryFullyAllocatedContinuation =
        batch.status === 'material_partially_outbound' && allActiveDemandsAllocated;
      const shortBatchAuthorizationId = ordinaryFullyAllocatedContinuation
        ? null
        : effectiveShortBatchAuthorizationId;
      const supplementOnly = allocations.every((row) => isSupplementDemand(row.demand_type));
      requireMaterialOutboundBatchStatus(batch.status, {
        supplementOnly,
        hasValidShortBatchAuthorization: effectiveShortBatchAuthorizationId !== null,
        hasConsumedShortBatchAuthorization:
          batch.status === 'doing' && !supplementOnly
            ? await hasConsumedShortBatchAuthorization(connection, batchId)
            : false,
        allActiveDemandsAllocated,
      });
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
        `INSERT INTO outbound_order (outbound_no,production_batch_id,work_order_id,short_batch_authorization_id,status,outbound_at,operator_id,remark,created_by,updated_by) VALUES (?,?,?,?,'pending_picking',NULL,NULL,?,?,?)`,
        [
          outboundNo,
          batchId,
          batch.work_order_id,
          shortBatchAuthorizationId,
          payload.remark ?? null,
          context.actorId,
          context.actorId,
        ],
      );
      for (const line of payload.details) {
        const allocation = byId.get(line.allocationId)!;
        await connection.execute<ResultSetHeader>(
          `INSERT INTO outbound_detail (outbound_id,production_batch_id,demand_id,allocation_id,item_id,material_variant_id,batch_id,outbound_number,unit_snapshot,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [
            orderResult.insertId,
            batchId,
            allocation.demand_id,
            allocation.id,
            allocation.item_id,
            allocation.material_variant_id,
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
        authorization_status: 'none' | 'valid' | 'stale' | 'consumed';
        has_active_demand: number;
        has_active_supplement_demand: number;
        all_active_demands_allocated: number;
        has_active_allocation: number;
        has_orderable_allocation: number;
        has_orderable_supplement_allocation: number;
      })[]
    >(
      `SELECT candidate.* FROM (
       SELECT b.id,b.batch_no,wo.work_order_no,wo.product_code_snapshot product_code,
        wo.product_name_snapshot product_name,b.status,b.created_at,
        CASE
          WHEN EXISTS (SELECT 1 FROM production_short_batch_authorization authorization WHERE authorization.production_batch_id=b.id AND authorization.status='active' AND authorization.material_plan_version=b.material_plan_version) THEN 'valid'
          WHEN EXISTS (SELECT 1 FROM production_short_batch_authorization authorization WHERE authorization.production_batch_id=b.id AND authorization.status='active') THEN 'stale'
          WHEN EXISTS (SELECT 1 FROM production_short_batch_authorization authorization WHERE authorization.production_batch_id=b.id AND authorization.status='consumed') THEN 'consumed'
          ELSE 'none'
        END authorization_status,
        EXISTS (SELECT 1 FROM production_item_demand demand WHERE demand.production_batch_id=b.id AND demand.business_status='active') has_active_demand,
        EXISTS (SELECT 1 FROM production_item_demand demand WHERE demand.production_batch_id=b.id AND demand.business_status='active' AND demand.demand_type IN ('scrap_supplement','material_loss_supplement')) has_active_supplement_demand,
        NOT ${activeDemandAllocationGapExistsSql('b.id')} all_active_demands_allocated,
        EXISTS (
          SELECT 1 FROM production_item_allocation allocation
          JOIN production_item_demand demand ON demand.id=allocation.demand_id AND demand.business_status='active'
          WHERE allocation.production_batch_id=b.id AND allocation.allocation_status='active'
            AND allocation.assigned_number
              - COALESCE((SELECT SUM(detail.outbound_number) FROM outbound_detail detail JOIN outbound_order outbound ON outbound.id=detail.outbound_id WHERE detail.allocation_id=allocation.id AND outbound.status='completed'),0) > 0
        ) has_active_allocation,
        EXISTS (
          SELECT 1 FROM production_item_allocation allocation
          JOIN production_item_demand demand ON demand.id=allocation.demand_id AND demand.business_status='active'
          WHERE allocation.production_batch_id=b.id AND allocation.allocation_status='active'
            AND allocation.assigned_number
              - COALESCE((SELECT SUM(detail.outbound_number) FROM outbound_detail detail JOIN outbound_order outbound ON outbound.id=detail.outbound_id WHERE detail.allocation_id=allocation.id AND outbound.status='completed'),0)
              - COALESCE((SELECT SUM(detail.outbound_number) FROM outbound_detail detail JOIN outbound_order outbound ON outbound.id=detail.outbound_id WHERE detail.allocation_id=allocation.id AND outbound.status IN ('pending_picking','picked','partially_outbound')),0) > 0
        ) has_orderable_allocation,
        EXISTS (
          SELECT 1 FROM production_item_allocation allocation
          JOIN production_item_demand demand ON demand.id=allocation.demand_id
          WHERE allocation.production_batch_id=b.id AND allocation.allocation_status='active'
            AND demand.business_status='active'
            AND demand.demand_type IN ('scrap_supplement','material_loss_supplement')
            AND allocation.assigned_number
              - COALESCE((SELECT SUM(detail.outbound_number) FROM outbound_detail detail JOIN outbound_order outbound ON outbound.id=detail.outbound_id WHERE detail.allocation_id=allocation.id AND outbound.status='completed'),0)
              - COALESCE((SELECT SUM(detail.outbound_number) FROM outbound_detail detail JOIN outbound_order outbound ON outbound.id=detail.outbound_id WHERE detail.allocation_id=allocation.id AND outbound.status IN ('pending_picking','picked','partially_outbound')),0) > 0
        ) has_orderable_supplement_allocation
       FROM production_batches b JOIN work_orders wo ON wo.id=b.work_order_id
       WHERE b.status IN ('material_pending','material_assigned','material_partially_outbound','material_outbound','doing')
       ) candidate
       WHERE candidate.has_active_demand=1
         AND (
           candidate.status IN ('material_pending','material_assigned','material_partially_outbound')
           OR (candidate.status='material_outbound' AND candidate.has_active_supplement_demand=1)
           OR (
             candidate.status='doing'
             AND (
               candidate.authorization_status='consumed'
               OR candidate.has_active_supplement_demand=1
             )
           )
         )
       ORDER BY candidate.created_at DESC,candidate.id DESC`,
    );
    return rows.map((row) => ({
      productionBatchId: String(row.id),
      batchNo: row.batch_no,
      workOrderNo: row.work_order_no,
      productCode: row.product_code,
      productName: row.product_name,
      batchStatus: row.status,
      outboundEligibility: evaluateMaterialOutboundEligibility({
        batchStatus: row.status,
        authorizationStatus: row.authorization_status,
        allActiveDemandsAllocated: Boolean(row.all_active_demands_allocated),
        hasActiveAllocation: Boolean(row.has_active_allocation),
        hasOrderableAllocation: Boolean(row.has_orderable_allocation),
        hasOrderableSupplementAllocation: Boolean(row.has_orderable_supplement_allocation),
      }),
    }));
  }

  async listOutboundCandidates(batchId: string): Promise<MaterialOutboundCandidateItem[]> {
    const batch = await findBatch(this.pool, batchId);
    const includeNormalDemands =
      (batch.status !== 'doing' && batch.status !== 'material_outbound') ||
      (batch.status === 'doing' && (await hasConsumedShortBatchAuthorization(this.pool, batchId)));
    const [rows] = await this.pool.query<
      (AllocationRow & {
        item_code_snapshot: string;
        product_name_snapshot: string;
        generation_group_key: string;
        supplement_no: string | null;
      })[]
    >(
      `${ALLOCATION_SELECT.replace(
        'SELECT a.id',
        'SELECT ib.item_code_snapshot,ib.product_name_snapshot,a.id',
      )} WHERE a.production_batch_id=? AND a.allocation_status='active' AND d.business_status='active' ORDER BY d.id,a.id`,
      [batchId],
    );
    return rows
      .filter((row) => includeNormalDemands || isSupplementDemand(row.demand_type))
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
          materialVariantId: String(row.material_variant_id),
          materialVariantCode: row.material_variant_code_snapshot,
          itemCode: row.item_code_snapshot,
          itemName: row.product_name_snapshot,
          generationGroupKey: row.generation_group_key,
          generationGroupType: row.demand_type,
          supplementNo: row.supplement_no,
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
          short_batch_authorization_id: number | null;
          status: string;
          version: number;
        })[]
      >(
        'SELECT id,production_batch_id,short_batch_authorization_id,status,version FROM outbound_order WHERE id=? FOR UPDATE',
        [outboundId],
      );
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
      if (
        (lockedBatch.status === 'material_pending' ||
          lockedBatch.status === 'material_partially_outbound') &&
        order.short_batch_authorization_id !== null
      ) {
        const effectiveAuthorizationId = await findEffectiveShortBatchAuthorizationId(
          connection,
          String(order.production_batch_id),
          lockedBatch.material_plan_version,
        );
        if (
          !effectiveAuthorizationId ||
          effectiveAuthorizationId !== String(order.short_batch_authorization_id)
        )
          throw new ProductionDomainError(
            'SHORT_BATCH_AUTHORIZATION_STALE',
            '物料需求计划已变化，当前短批授权已失效，请取消该待出库单并重新授权',
          );
      } else if (
        lockedBatch.status === 'material_pending' ||
        lockedBatch.status === 'material_partially_outbound'
      ) {
        requireMaterialOutboundBatchStatus(lockedBatch.status, {
          allActiveDemandsAllocated: await areAllActiveDemandsAllocated(
            connection,
            String(order.production_batch_id),
          ),
        });
      }
      await connection.query(
        `SELECT id FROM batch_step_records
         WHERE production_batch_id=? ORDER BY step_order_snapshot,id FOR UPDATE`,
        [order.production_batch_id],
      );
      const [details] = await connection.query<OutboundDetailRow[]>(
        `SELECT od.id,od.outbound_id,od.allocation_id,od.demand_id,od.item_id,od.batch_id,
          ib.batch_code,ib.material_variant_id,ib.material_variant_code_snapshot,ib.item_code_snapshot,ib.product_name_snapshot,od.outbound_number,od.unit_snapshot,
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
      const requestedByBatch = new Map<
        string,
        { itemId: number; materialVariantId: number; quantity: number }
      >();
      const requestedByDemand = new Map<string, number>();
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
          materialVariantId: detail.material_variant_id,
          quantity: (current?.quantity ?? 0) + integerQuantity(detail.outbound_number),
        });
        const demandId = String(detail.demand_id);
        requestedByDemand.set(
          demandId,
          (requestedByDemand.get(demandId) ?? 0) + integerQuantity(detail.outbound_number),
        );
      }
      await lockIds(
        connection,
        'production_item_demand',
        [...requestedByDemand.keys()].sort(bigintCompare),
      );
      for (const [batchId, requested] of requestedByBatch) {
        const [[stock]] = await connection.query<(RowDataPacket & { quantity: string })[]>(
          "SELECT COALESCE(SUM(quantity),0) quantity FROM inventory_transaction WHERE batch_id=? AND item_id=? AND material_variant_id=? AND stock_status='available'",
          [batchId, requested.itemId, requested.materialVariantId],
        );
        if (requested.quantity > integerQuantity(stock?.quantity ?? 0))
          throw new ProductionDomainError(
            'INSUFFICIENT_AVAILABLE_STOCK',
            '库存账面可用数量不足，整单未扣减',
          );
      }
      for (const [demandId, quantity] of [...requestedByDemand].sort(([left], [right]) =>
        bigintCompare(left, right),
      )) {
        const [demandUpdated] = await connection.execute<ResultSetHeader>(
          `UPDATE production_item_demand
           SET fulfilled_by=IF(remaining_number=?, ?, NULL),
               fulfilled_at=IF(remaining_number=?, NOW(), NULL),
               business_status=IF(remaining_number=?,'fulfilled','active'),
               remaining_number=remaining_number-?,version=version+1,updated_by=?
           WHERE id=? AND business_status='active' AND remaining_number>=?`,
          [
            quantity,
            context.actorId,
            quantity,
            quantity,
            quantity,
            context.actorId,
            demandId,
            quantity,
          ],
        );
        if (demandUpdated.affectedRows !== 1)
          throw new ProductionDomainError(
            'OUTBOUND_EXCEEDS_ALLOCATION',
            '出库数量超过需求剩余数量，请刷新后重试',
          );
      }
      for (const detail of details) {
        await connection.execute(
          `INSERT INTO inventory_transaction (item_id,material_variant_id,batch_id,transaction_type,quantity,unit_snapshot,stock_status,reference_type,reference_detail_id,idempotency_key,created_by)
           VALUES (?,?,?,'production_material_outbound',? * -1,?,'available','outbound_detail',?,?,?)`,
          [
            detail.item_id,
            detail.material_variant_id,
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
      const allOutbound = await allDemandsOutbound(connection, String(order.production_batch_id));
      if (allOutbound) {
        if (
          lockedBatch.status === 'material_pending' ||
          lockedBatch.status === 'material_assigned' ||
          lockedBatch.status === 'material_partially_outbound'
        )
          requireBatchTransition(lockedBatch.status, 'material_outbound');
        await connection.execute(
          "UPDATE production_batches SET status='material_outbound',version=version+1,updated_by=? WHERE id=? AND status IN ('material_pending','material_assigned','material_partially_outbound')",
          [context.actorId, order.production_batch_id],
        );
        await connection.execute(
          `UPDATE production_short_batch_authorization
           SET status='superseded',version=version+1
           WHERE production_batch_id=? AND status='active'`,
          [order.production_batch_id],
        );
      } else if (
        order.short_batch_authorization_id !== null &&
        lockedBatch.status === 'material_pending'
      ) {
        requireBatchTransition(lockedBatch.status, 'material_partially_outbound');
        await connection.execute(
          "UPDATE production_batches SET status='material_partially_outbound',version=version+1,updated_by=? WHERE id=? AND status='material_pending'",
          [context.actorId, order.production_batch_id],
        );
      }
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
      `SELECT od.id,od.outbound_id,od.allocation_id,od.demand_id,od.item_id,od.material_variant_id,od.batch_id,ib.batch_code,
        ib.material_variant_code_snapshot,ib.item_code_snapshot,ib.product_name_snapshot,d.generation_group_key,d.demand_type generation_group_type,
        s.supplement_no,od.outbound_number,od.unit_snapshot,it.id inventory_transaction_id
       FROM outbound_detail od JOIN item_batch ib ON ib.id=od.batch_id
       JOIN production_item_demand d ON d.id=od.demand_id
       LEFT JOIN production_material_supplement s ON s.id=d.supplement_id
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
      shortBatchAuthorizationId:
        row.short_batch_authorization_id === null ? null : String(row.short_batch_authorization_id),
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
        materialVariantId: String(detail.material_variant_id),
        materialVariantCode: detail.material_variant_code_snapshot,
        itemBatchId: String(detail.batch_id),
        batchCode: detail.batch_code,
        itemCode: detail.item_code_snapshot,
        itemName: detail.product_name_snapshot,
        generationGroupKey: detail.generation_group_key,
        generationGroupType: detail.generation_group_type,
        supplementNo: detail.supplement_no,
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
const areAllActiveDemandsAllocated = async (
  db: Pool | PoolConnection,
  batchId: string,
): Promise<boolean> => {
  const [[row]] = await db.query<(RowDataPacket & { missing: number })[]>(
    `SELECT ${activeDemandAllocationGapExistsSql('?')} missing`,
    [batchId],
  );
  return Number(row?.missing ?? 1) === 0;
};
const isSupplementDemand = (value: string) =>
  value === 'scrap_supplement' || value === 'material_loss_supplement';
const allDemandsOutbound = async (db: PoolConnection, batchId: string) => {
  const [[row]] = await db.query<(RowDataPacket & { missing: number })[]>(
    `SELECT COUNT(*) missing FROM production_item_demand d
     WHERE d.production_batch_id=? AND d.business_status='active'`,
    [batchId],
  );
  return Number(row?.missing ?? 1) === 0;
};

const OUTBOUND_SELECT = `SELECT o.id,o.outbound_no,o.production_batch_id,b.batch_no,o.work_order_id,o.short_batch_authorization_id,
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

type ShortBatchPreviewRow = RowDataPacket & {
  demand_id: number;
  item_id: number;
  material_variant_id: number;
  material_variant_code_snapshot: string;
  item_code: string;
  item_name: string;
  generation_group_key: string;
  generation_group_type: ShortBatchAuthorizationPreviewLine['generationGroupType'];
  supplement_no: string | null;
  unit_snapshot: string;
  need_number: string;
  remaining_number: string;
  confirmed_outbound: string;
  available_allocated: string;
};

type ExistingShortBatchAuthorization = {
  id: number;
  status: 'active' | 'consumed';
  materialPlanVersion: number;
  details: Map<string, string>;
};

const buildShortBatchAuthorizationPreview = async (
  db: Pool | PoolConnection,
  batch: Awaited<ReturnType<typeof findBatch>>,
): Promise<ShortBatchAuthorizationPreview> => {
  const [rows] = await db.query<ShortBatchPreviewRow[]>(
    `SELECT demand.id demand_id,demand.item_id,demand.material_variant_id,demand.material_variant_code_snapshot,
      demand.item_code_snapshot item_code,
      demand.item_name_snapshot item_name,demand.generation_group_key,
      demand.demand_type generation_group_type,supplement.supplement_no,
      demand.unit_snapshot,demand.need_number,
      demand.remaining_number,
      COALESCE((SELECT SUM(detail.outbound_number)
        FROM outbound_detail detail
        JOIN outbound_order outbound ON outbound.id=detail.outbound_id
        WHERE detail.demand_id=demand.id AND outbound.status='completed'),0)
        - COALESCE((SELECT SUM(return_detail.return_number)
          FROM return_detail JOIN return_order ON return_order.id=return_detail.return_id
          WHERE return_detail.demand_id=demand.id AND return_order.status='returned'
            AND return_detail.release_after_return=1),0) confirmed_outbound,
      COALESCE((SELECT SUM(GREATEST(
        allocation.assigned_number
        - COALESCE((
          SELECT SUM(detail.outbound_number)
          FROM outbound_detail detail
          JOIN outbound_order outbound ON outbound.id=detail.outbound_id
          WHERE detail.allocation_id=allocation.id AND outbound.status='completed'
        ),0)
        - COALESCE((
          SELECT SUM(return_detail.return_number)
          FROM return_detail
          JOIN return_order ON return_order.id=return_detail.return_id
          WHERE return_detail.allocation_id=allocation.id
            AND return_order.status='returned'
            AND return_detail.release_after_return=1
        ),0),0))
        FROM production_item_allocation allocation
        WHERE allocation.demand_id=demand.id
          AND allocation.allocation_status NOT IN ('released','cancelled')),0) available_allocated
     FROM production_item_demand demand
     LEFT JOIN production_material_supplement supplement ON supplement.id=demand.supplement_id
     WHERE demand.production_batch_id=? AND demand.business_status='active'
     ORDER BY demand.id`,
    [String(batch.id)],
  );
  const existingAuthorization = await findExistingShortBatchAuthorization(db, String(batch.id));
  const netConfirmedOutboundQuantity = await getNetConfirmedMaterialOutboundQuantity(
    db,
    String(batch.id),
  );
  const lines: ShortBatchAuthorizationPreviewLine[] = rows.map((row) => {
    const remaining = integerQuantity(row.remaining_number);
    const expectedOutbound = Math.min(remaining, integerQuantity(row.available_allocated));
    return {
      demandId: String(row.demand_id),
      itemId: String(row.item_id),
      materialVariantId: String(row.material_variant_id),
      materialVariantCode: row.material_variant_code_snapshot,
      itemCode: row.item_code,
      itemName: row.item_name,
      generationGroupKey: row.generation_group_key,
      generationGroupType: row.generation_group_type,
      supplementNo: row.supplement_no,
      unit: row.unit_snapshot,
      demandQuantity: decimal(integerQuantity(row.need_number)),
      confirmedOutboundQuantity: decimal(integerQuantity(row.confirmed_outbound)),
      expectedOutboundQuantity: decimal(expectedOutbound),
      authorizedRemainingQuantity: decimal(Math.max(0, remaining - expectedOutbound)),
      existingAuthorizedRemainingQuantity:
        existingAuthorization?.details.get(String(row.demand_id)) ?? null,
    };
  });
  const authorizationStatus: ShortBatchAuthorizationPreview['authorizationStatus'] =
    !existingAuthorization
      ? 'none'
      : existingAuthorization.status === 'consumed'
        ? 'consumed'
        : existingAuthorization.materialPlanVersion === batch.material_plan_version
          ? 'valid'
          : 'stale';
  const eligibleStatus =
    batch.status === 'material_pending' || batch.status === 'material_partially_outbound';
  const hasExpectedOutbound = lines.some(
    (line) => integerQuantity(line.expectedOutboundQuantity) > 0,
  );
  const hasShortage = lines.some((line) => integerQuantity(line.authorizedRemainingQuantity) > 0);
  const currentAuthorizationCoversShortage = lines.every((line) => {
    const existing = line.existingAuthorizedRemainingQuantity;
    return (
      existing !== null &&
      integerQuantity(line.authorizedRemainingQuantity) <= integerQuantity(existing)
    );
  });
  const authorizationCoverage: ShortBatchAuthorizationPreview['authorizationCoverage'] =
    authorizationStatus === 'consumed'
      ? 'consumed'
      : authorizationStatus === 'stale'
        ? 'stale'
        : authorizationStatus === 'valid'
          ? currentAuthorizationCoversShortage
            ? 'covered'
            : 'insufficient'
          : 'none';
  const authorizationAction: ShortBatchAuthorizationPreview['authorizationAction'] =
    authorizationStatus === 'consumed'
      ? 'view'
      : !eligibleStatus || !hasShortage
        ? 'not_required'
        : authorizationStatus === 'valid'
          ? currentAuthorizationCoversShortage
            ? 'view'
            : 'adjust'
          : authorizationStatus === 'stale'
            ? 'reauthorize'
            : 'authorize';
  const blockedReason = !eligibleStatus
    ? '只有备料中或已部分领料的任务可以授权短批开工'
    : lines.length === 0
      ? '当前任务没有未完成物料需求'
      : !hasShortage
        ? '物料已齐套，无需短批授权'
        : !hasExpectedOutbound && netConfirmedOutboundQuantity <= 0
          ? '当前尚无可预计出库分配，且批次没有净确认领料'
          : authorizationAction === 'view'
            ? authorizationStatus === 'consumed'
              ? '该短批授权已经用于开工，仅供查看'
              : '当前短批授权仍覆盖现有缺口，无需重复授权'
            : null;
  return {
    productionBatchId: String(batch.id),
    batchStatus: batch.status,
    batchVersion: batch.version,
    materialPlanVersion: batch.material_plan_version,
    authorizationStatus,
    authorizationAction,
    authorizationCoverage,
    blockedReason,
    lines,
  };
};

const findExistingShortBatchAuthorization = async (
  db: Pool | PoolConnection,
  batchId: string,
): Promise<ExistingShortBatchAuthorization | null> => {
  const [[row]] = await db.query<
    (RowDataPacket & {
      id: number;
      status: 'active' | 'consumed';
      material_plan_version: number;
    })[]
  >(
    `SELECT id,status,material_plan_version
     FROM production_short_batch_authorization
     WHERE production_batch_id=? AND status IN ('active','consumed')
     ORDER BY CASE WHEN status='active' THEN 0 ELSE 1 END,id DESC LIMIT 1`,
    [batchId],
  );
  if (!row) return null;
  const [details] = await db.query<
    (RowDataPacket & { demand_id: number; authorized_remaining_quantity: string })[]
  >(
    `SELECT demand_id,authorized_remaining_quantity
     FROM production_short_batch_authorization_detail WHERE authorization_id=?`,
    [row.id],
  );
  return {
    id: row.id,
    status: row.status,
    materialPlanVersion: row.material_plan_version,
    details: new Map(
      details.map((detail) => [String(detail.demand_id), detail.authorized_remaining_quantity]),
    ),
  };
};

const findEffectiveShortBatchAuthorizationId = async (
  db: Pool | PoolConnection,
  batchId: string,
  materialPlanVersion: number,
): Promise<string | null> => {
  const [[row]] = await db.query<(RowDataPacket & { id: number })[]>(
    `SELECT id FROM production_short_batch_authorization
     WHERE production_batch_id=? AND material_plan_version=? AND status='active'
     ORDER BY id DESC LIMIT 1`,
    [batchId, materialPlanVersion],
  );
  return row ? String(row.id) : null;
};
