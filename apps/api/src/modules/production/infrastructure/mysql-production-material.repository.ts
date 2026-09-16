import { currentMaterialNameSql } from './queries/material-name.sql.js';
import { Inject, Injectable } from '@nestjs/common';
import { withTransaction } from '@company/database';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  AvailableItemBatchItem,
  CreateMaterialAllocationsPayload,
  MaterialAllocationCommandResult,
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
import {
  isAdditionalMaterialDemand,
  requireMaterialAllocationBatchStatus,
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
} from './mysql-production-material.mapper.js';
import { areAllActiveDemandsAllocated, lockIds } from './mysql-production-material-persistence.js';
import { findBatch } from './mysql-production.shared.js';
import {
  getConfirmedMaterialOutboundQuantity,
  hasConsumedShortBatchAuthorization,
} from './mysql-production-short-batch.js';

@Injectable()
export class MysqlProductionMaterialRepository extends ProductionMaterialRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {
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
    const [rows] = await this.pool.query<AvailableRow[]>(
      `SELECT ib.id,ib.item_id,ib.material_variant_id,ib.material_variant_code_snapshot,ib.item_code_snapshot,${currentMaterialNameSql('ib.item_id')} item_name,ib.batch_code,ib.unit_snapshot,ib.source_type,ib.provider,ib.production_date,
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
      itemName: row.item_name,
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
    _batchId: string,
    _version: number,
    _reason: string,
    _context: CommandContext,
  ): Promise<CloseRemainingMaterialDemandsResult> {
    throw new ProductionDomainError(
      'INVALID_STATE',
      '短批不再直接关闭全部需求；录入错误请申请单条更正，停止生产请开始批次收尾',
    );
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
        (RowDataPacket & { id: number; demand_type: ProductionMaterialDemandItem['demandType'] })[]
      >(
        `SELECT id,demand_type FROM production_item_demand WHERE id IN (${placeholders(demandIds)}) ORDER BY id`,
        demandIds,
      );
      const additionalDemandOnly =
        demandTypes.length === demandIds.length &&
        demandTypes.every((row) => isAdditionalMaterialDemand(row.demand_type));
      requireMaterialAllocationBatchStatus(
        batch.status,
        additionalDemandOnly,
        batch.status === 'doing' && !additionalDemandOnly
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
            pending_correction_id: number | null;
          })[]
        >(
          'SELECT production_batch_id,item_id,material_variant_id,unit_snapshot,need_number,business_status,pending_correction_id FROM production_item_demand WHERE id=? FOR UPDATE',
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
        if (demand.business_status !== 'active' || demand.pending_correction_id !== null)
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
           COALESCE((SELECT SUM(allocation.assigned_number) FROM production_item_allocation allocation
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
      if (row.demand_business_status !== 'active' || row.pending_correction_id !== null)
        throw new ProductionDomainError('INVALID_STATE', '该需求已结束或更正审批中，不能释放分配');
      const additionalDemand = isAdditionalMaterialDemand(row.demand_type);
      requireMaterialAllocationBatchStatus(
        batch.status,
        additionalDemand,
        batch.status === 'doing' && !additionalDemand
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

type ShortBatchPreviewRow = RowDataPacket & {
  demand_id: number;
  pending_correction_id: number | null;
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
    `SELECT demand.id demand_id,demand.pending_correction_id,demand.item_id,demand.material_variant_id,demand.material_variant_code_snapshot,
      demand.item_code_snapshot item_code,
      ${currentMaterialNameSql('demand.item_id')} item_name,demand.generation_group_key,
      demand.demand_type generation_group_type,supplement.supplement_no,
      demand.unit_snapshot,demand.need_number,
      demand.remaining_number,
      COALESCE((SELECT SUM(detail.outbound_number)
        FROM outbound_detail detail
        JOIN outbound_order outbound ON outbound.id=detail.outbound_id
        WHERE detail.demand_id=demand.id AND outbound.status='completed'),0) confirmed_outbound,
      COALESCE((SELECT SUM(GREATEST(
        allocation.assigned_number
        - COALESCE((
          SELECT SUM(detail.outbound_number)
          FROM outbound_detail detail
          JOIN outbound_order outbound ON outbound.id=detail.outbound_id
          WHERE detail.allocation_id=allocation.id AND outbound.status='completed'
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
  const confirmedOutboundQuantity = await getConfirmedMaterialOutboundQuantity(
    db,
    String(batch.id),
  );
  const lines: ShortBatchAuthorizationPreviewLine[] = rows.map((row) => {
    const remaining = integerQuantity(row.remaining_number);
    const expectedOutbound =
      row.pending_correction_id != null
        ? 0
        : Math.min(remaining, integerQuantity(row.available_allocated));
    return {
      demandId: String(row.demand_id),
      pendingCorrectionId:
        row.pending_correction_id == null ? null : String(row.pending_correction_id),
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
        : !hasExpectedOutbound && confirmedOutboundQuantity <= 0
          ? '当前尚无可预计出库分配，且批次没有已确认领料'
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
