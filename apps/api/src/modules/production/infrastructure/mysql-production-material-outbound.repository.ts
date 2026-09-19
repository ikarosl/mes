import { materialOutboundDetailsSql } from './queries/material-outbound-details.sql.js';
import { MaterialVariantQuery, ProductInventoryEligibility } from '../../product/public.js';
import { InventoryStockCommand } from '../../inventory/public.js';
import { currentMaterialNameSql } from './queries/material-name.sql.js';
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { withTransaction } from '@company/database';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  CreateMaterialOutboundPayload,
  MaterialOutboundCommandResult,
  MaterialOutboundItem,
  MaterialOutboundQuery,
  MaterialOutboundBatchOption,
  MaterialOutboundCandidateItem,
  PageResult,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import { toBeijingISOString } from '../../../common/time/date-time.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { ProductionMaterialOutboundRepository } from '../application/ports/production-material-outbound.repository.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { integerQuantity } from '../domain/integer-quantity.js';
import { evaluateMaterialOutboundEligibility } from '../domain/production-material-outbound-eligibility.js';
import {
  ADDITIONAL_MATERIAL_DEMAND_TYPES,
  isAdditionalMaterialDemand,
  requireMaterialOutboundBatchStatus,
} from '../domain/production-material.policy.js';
import { requireBatchTransition } from '../domain/production-status.policy.js';
import {
  ALLOCATION_SELECT,
  bigintCompare,
  decimal,
  placeholders,
  type AllocationRow,
  type OutboundDetailRow,
  type OutboundRow,
} from './mysql-production-material.mapper.js';
import { activeDemandAllocationGapExistsSql } from './mysql-production-material.sql.js';
import { areAllActiveDemandsAllocated, lockIds } from './mysql-production-material-persistence.js';
import { findBatch } from './mysql-production.shared.js';
import { fulfillReadySupplements } from './mysql-production-supplement-activation.js';
import { hasConsumedShortBatchAuthorization } from './mysql-production-short-batch.js';

@Injectable()
export class MysqlProductionMaterialOutboundRepository extends ProductionMaterialOutboundRepository {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly inventory: InventoryStockCommand,
    private readonly productEligibility: ProductInventoryEligibility,
    private readonly variants: MaterialVariantQuery,
  ) {
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
        `${ALLOCATION_SELECT} WHERE a.id IN (${placeholders(allocationIds)}) AND a.production_batch_id=? AND d.business_status='active' AND d.pending_correction_id IS NULL ORDER BY a.id FOR UPDATE`,
        [...allocationIds, batchId],
      );
      if (allocations.length !== allocationIds.length)
        throw new ProductionDomainError('NOT_FOUND', '出库分配不存在或不属于当前批次');
      const eligibility = await this.productEligibility.requireProductionIssuableReferences({
        references: allocations.map((row) => ({
          itemId: String(row.item_id),
          materialVariantId: String(row.material_variant_id),
        })),
      });
      if (eligibility.status !== 'success')
        throw new ProductionDomainError(
          eligibility.status === 'not-found' ? 'NOT_FOUND' : 'INVALID_INPUT',
          eligibility.message,
        );
      const allActiveDemandsAllocated = await areAllActiveDemandsAllocated(
        connection,
        batchId,
        this.variants,
      );
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
      const additionalDemandOnly = allocations.every((row) =>
        isAdditionalMaterialDemand(row.demand_type),
      );
      requireMaterialOutboundBatchStatus(batch.status, {
        additionalDemandOnly,
        hasValidShortBatchAuthorization: effectiveShortBatchAuthorizationId !== null,
        hasConsumedShortBatchAuthorization:
          batch.status === 'doing' && !additionalDemandOnly
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
        has_active_additional_demand: number;
        all_active_demands_allocated: number;
        has_active_allocation: number;
        has_orderable_allocation: number;
        has_orderable_additional_allocation: number;
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
        EXISTS (SELECT 1 FROM production_item_demand demand WHERE demand.production_batch_id=b.id AND demand.business_status='active' AND demand.demand_type IN (${placeholders([...ADDITIONAL_MATERIAL_DEMAND_TYPES])})) has_active_additional_demand,
        NOT ${activeDemandAllocationGapExistsSql('b.id')} all_active_demands_allocated,
        EXISTS (
          SELECT 1 FROM production_item_allocation allocation
          JOIN production_item_demand demand ON demand.id=allocation.demand_id AND demand.business_status='active' AND demand.pending_correction_id IS NULL
          WHERE allocation.production_batch_id=b.id AND allocation.allocation_status='active'
            AND allocation.assigned_number
              - COALESCE((SELECT SUM(detail.outbound_number) FROM outbound_detail detail JOIN outbound_order outbound ON outbound.id=detail.outbound_id WHERE detail.allocation_id=allocation.id AND outbound.status='completed'),0) > 0
        ) has_active_allocation,
        EXISTS (
          SELECT 1 FROM production_item_allocation allocation
          JOIN production_item_demand demand ON demand.id=allocation.demand_id AND demand.business_status='active' AND demand.pending_correction_id IS NULL
          WHERE allocation.production_batch_id=b.id AND allocation.allocation_status='active'
            AND allocation.assigned_number
              - COALESCE((SELECT SUM(detail.outbound_number) FROM outbound_detail detail JOIN outbound_order outbound ON outbound.id=detail.outbound_id WHERE detail.allocation_id=allocation.id AND outbound.status='completed'),0)
              - COALESCE((SELECT SUM(detail.outbound_number) FROM outbound_detail detail JOIN outbound_order outbound ON outbound.id=detail.outbound_id WHERE detail.allocation_id=allocation.id AND outbound.status IN ('pending_picking','picked','partially_outbound')),0) > 0
        ) has_orderable_allocation,
        EXISTS (
          SELECT 1 FROM production_item_allocation allocation
          JOIN production_item_demand demand ON demand.id=allocation.demand_id
          WHERE allocation.production_batch_id=b.id AND allocation.allocation_status='active'
            AND demand.business_status='active' AND demand.pending_correction_id IS NULL
            AND demand.demand_type IN (${placeholders([...ADDITIONAL_MATERIAL_DEMAND_TYPES])})
            AND allocation.assigned_number
              - COALESCE((SELECT SUM(detail.outbound_number) FROM outbound_detail detail JOIN outbound_order outbound ON outbound.id=detail.outbound_id WHERE detail.allocation_id=allocation.id AND outbound.status='completed'),0)
              - COALESCE((SELECT SUM(detail.outbound_number) FROM outbound_detail detail JOIN outbound_order outbound ON outbound.id=detail.outbound_id WHERE detail.allocation_id=allocation.id AND outbound.status IN ('pending_picking','picked','partially_outbound')),0) > 0
        ) has_orderable_additional_allocation
       FROM production_batches b JOIN work_orders wo ON wo.id=b.work_order_id
       WHERE b.status IN ('material_pending','material_assigned','material_partially_outbound','material_outbound','doing')
       ) candidate
       WHERE candidate.has_active_demand=1
         AND (
           candidate.status IN ('material_pending','material_assigned','material_partially_outbound')
           OR (candidate.status='material_outbound' AND candidate.has_active_additional_demand=1)
           OR (
             candidate.status='doing'
             AND (
               candidate.authorization_status='consumed'
               OR candidate.has_active_additional_demand=1
             )
           )
         )
       ORDER BY candidate.created_at DESC,candidate.id DESC`,
      [...ADDITIONAL_MATERIAL_DEMAND_TYPES, ...ADDITIONAL_MATERIAL_DEMAND_TYPES],
    );
    const optionIds = rows.map((row) => String(row.id));
    if (optionIds.length) {
      const [demands] = await this.pool.query<
        (RowDataPacket & {
          production_batch_id: number;
          item_id: number;
          material_variant_id: number;
        })[]
      >(
        `SELECT production_batch_id,item_id,material_variant_id FROM production_item_demand WHERE production_batch_id IN (${placeholders(optionIds)}) AND business_status='active'`,
        optionIds,
      );
      const enabled = new Set(
        (
          await this.variants.listEnabledByMaterials([
            ...new Set(demands.map((row) => String(row.item_id))),
          ])
        ).map((row) => row.id),
      );
      const [allocations] = await this.pool.query<AllocationRow[]>(
        `${ALLOCATION_SELECT} WHERE a.production_batch_id IN (${placeholders(optionIds)}) AND a.allocation_status='active' AND d.business_status='active' AND d.pending_correction_id IS NULL`,
        optionIds,
      );
      for (const row of rows) {
        const active = allocations.filter(
          (a) =>
            String(a.production_batch_id) === String(row.id) &&
            enabled.has(String(a.material_variant_id)),
        );
        if (
          demands.some(
            (d) =>
              String(d.production_batch_id) === String(row.id) &&
              !enabled.has(String(d.material_variant_id)),
          )
        )
          row.all_active_demands_allocated = 0;
        row.has_active_allocation = Number(
          active.some(
            (a) => integerQuantity(a.assigned_number) > integerQuantity(a.outbound_quantity),
          ),
        );
        row.has_orderable_allocation = Number(
          active.some(
            (a) =>
              integerQuantity(a.assigned_number) >
              integerQuantity(a.outbound_quantity) + integerQuantity(a.pending_outbound_quantity),
          ),
        );
        row.has_orderable_additional_allocation = Number(
          active.some(
            (a) =>
              isAdditionalMaterialDemand(a.demand_type) &&
              integerQuantity(a.assigned_number) >
                integerQuantity(a.outbound_quantity) + integerQuantity(a.pending_outbound_quantity),
          ),
        );
      }
    }
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
        hasOrderableAdditionalAllocation: Boolean(row.has_orderable_additional_allocation),
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
        item_name: string;
        generation_group_key: string;
        supplement_no: string | null;
      })[]
    >(
      `${ALLOCATION_SELECT.replace(
        'SELECT a.id',
        `SELECT d.item_code_snapshot,${currentMaterialNameSql('d.item_id')} item_name,a.id`,
      )} WHERE a.production_batch_id=? AND a.allocation_status='active' AND d.business_status='active' AND d.pending_correction_id IS NULL ORDER BY d.id,a.id`,
      [batchId],
    );
    const enabled = new Set(
      (
        await this.variants.listEnabledByMaterials([
          ...new Set(rows.map((row) => String(row.item_id))),
        ])
      ).map((row) => row.id),
    );
    const inventoryRows = new Map(
      (
        await this.inventory.materialBatchReferences([
          ...new Set(rows.map((row) => String(row.batch_id))),
        ])
      ).map((row) => [row.id, row]),
    );
    for (const row of rows) {
      const reference = inventoryRows.get(String(row.batch_id));
      row.batch_code = reference?.batchCode ?? '';
      row.material_variant_code_snapshot = reference?.materialVariantCode ?? '';
    }
    return rows
      .filter(
        (row) =>
          enabled.has(String(row.material_variant_id)) &&
          inventoryRows.get(String(row.batch_id))?.batchStatus === 'available',
      )
      .filter((row) => includeNormalDemands || isAdditionalMaterialDemand(row.demand_type))
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
          itemName: row.item_name,
          generationGroupKey: row.generation_group_key,
          generationGroupType: row.demand_type,
          supplementNo: row.supplement_no,
          itemBatchId: String(row.batch_id),
          batchCode: row.batch_code,
          assignedQuantity: String(row.assigned_number),
          confirmedOutboundQuantity: String(row.outbound_quantity),
          pendingOutboundQuantity: String(row.pending_outbound_quantity),
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
      let hasValidShortBatchAuthorization = false;
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
            '物料需求计划已变化，当前短批授权已失效，请取消该待出库单并重新授权，重建出库单',
          );
        hasValidShortBatchAuthorization = true;
      }
      await connection.query(
        `SELECT id FROM batch_step_records
         WHERE production_batch_id=? ORDER BY step_order_snapshot,id FOR UPDATE`,
        [order.production_batch_id],
      );
      const [details] = await connection.query<OutboundDetailRow[]>(
        `SELECT od.id,od.outbound_id,od.allocation_id,od.demand_id,od.item_id,od.batch_id,
          NULL batch_code,od.material_variant_id,NULL material_variant_code_snapshot,NULL item_code_snapshot,NULL item_name,od.outbound_number,od.unit_snapshot,
          NULL inventory_transaction_id
         FROM outbound_detail od
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
        `${ALLOCATION_SELECT} WHERE a.id IN (${placeholders(allocationIds)}) ORDER BY a.id FOR UPDATE`,
        allocationIds,
      );
      if (allocations.length !== allocationIds.length)
        throw new ProductionDomainError('OUTBOUND_ALLOCATION_CHANGED', '出库单对应分配已失效');
      const additionalDemandOnly = allocations.every((row) =>
        isAdditionalMaterialDemand(row.demand_type),
      );
      // 制单后可能开工或追加需求；确认时按当前状态和本单需求类型重做领料资格校验。
      requireMaterialOutboundBatchStatus(lockedBatch.status, {
        additionalDemandOnly,
        hasValidShortBatchAuthorization,
        hasConsumedShortBatchAuthorization:
          lockedBatch.status === 'doing' && !additionalDemandOnly
            ? await hasConsumedShortBatchAuthorization(
                connection,
                String(order.production_batch_id),
              )
            : false,
        allActiveDemandsAllocated: await areAllActiveDemandsAllocated(
          connection,
          String(order.production_batch_id),
          this.variants,
        ),
      });
      const byAllocation = new Map(allocations.map((row) => [String(row.id), row]));
      const itemBatchIds = [...new Set(details.map((row) => String(row.batch_id)))].sort(
        bigintCompare,
      );
      const eligibility = await this.productEligibility.requireProductionIssuableReferences({
        references: details.map((row) => ({
          itemId: String(row.item_id),
          materialVariantId: String(row.material_variant_id),
        })),
      });
      if (eligibility.status !== 'success')
        throw new ProductionDomainError(
          eligibility.status === 'not-found' ? 'NOT_FOUND' : 'INVALID_INPUT',
          eligibility.message,
        );
      const lockedStocks = new Map(
        (await this.inventory.lockMaterialBatches(itemBatchIds)).map((row) => [row.id, row]),
      );
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
        const stock = lockedStocks.get(batchId);
        if (requested.quantity > integerQuantity(stock?.availableQuantity ?? 0))
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
           WHERE id=? AND business_status='active' AND pending_correction_id IS NULL AND remaining_number>=?`,
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
      await this.inventory.recordProductionOutbound(
        outboundId,
        details.map((detail) => ({
          itemId: String(detail.item_id),
          materialVariantId: String(detail.material_variant_id),
          batchId: String(detail.batch_id),
          quantity: String(detail.outbound_number),
          unit: detail.unit_snapshot,
          detailId: String(detail.id),
        })),
        context,
      );
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
    const [details] = await db.query<OutboundDetailRow[]>(materialOutboundDetailsSql(ids), ids);
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
        itemName: detail.item_name,
        generationGroupKey: detail.generation_group_key,
        generationGroupType: detail.generation_group_type,
        supplementNo: detail.supplement_no,
        outboundQuantity: String(detail.outbound_number),
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
