import { MysqlProductionMaterialOutboundRead } from './mysql-production-material-outbound.read.js';
import {
  planMaterialOutboundConfirmation,
  requireMaterialOutboundStockQuantities,
  materialOutboundBatchStatus,
} from '../../domain/production-material-outbound.policy.js';
import { hydrateAllocationQuantities } from '../demand/mysql-production-material-facts.js';
import { MaterialVariantQuery, ProductInventoryEligibility } from '../../../product/public.js';
import {
  InventoryStockCommand,
  InventoryProductionDocumentCommand,
} from '../../../inventory/public.js';
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
import type { CommandContext } from '../../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../../common/audit/transactional-audit-writer.js';
import { DATABASE_POOL } from '../../../../infrastructure/database/database.module.js';
import { ProductionMaterialOutboundRepository } from '../../application/ports/production-material-outbound.repository.js';
import { ProductionDomainError } from '../../domain/production.errors.js';
import { integerQuantity } from '../../domain/integer-quantity.js';
import { requireMaterialOutboundBatchStatus } from '../../domain/production-material.policy.js';
import {
  ALLOCATION_SELECT,
  bigintCompare,
  placeholders,
  type AllocationRow,
} from '../demand/mysql-production-material.mapper.js';
import { lockIds } from '../demand/mysql-production-material-persistence.js';
import { findBatch } from '../tasks/mysql-production-batch.persistence.js';
import { fulfillReadySupplements } from '../execution/mysql-production-supplement-activation.js';

@Injectable()
export class MysqlProductionMaterialOutboundRepository extends ProductionMaterialOutboundRepository {
  private readonly read: MysqlProductionMaterialOutboundRead;

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly inventory: InventoryStockCommand,
    private readonly productEligibility: ProductInventoryEligibility,
    variants: MaterialVariantQuery,
    private readonly documents: InventoryProductionDocumentCommand,
  ) {
    super();
    this.read = new MysqlProductionMaterialOutboundRead(pool, inventory, variants, documents);
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
      await hydrateAllocationQuantities(allocations, this.documents, true);
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
      requireMaterialOutboundBatchStatus(batch.status);
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
      const created = await this.documents.createOutbound(
        {
          productionBatchId: batchId,
          workOrderId: String(batch.work_order_id),
          remark: payload.remark,
          lines: payload.details.map((line) => {
            const allocation = byId.get(line.allocationId)!;
            return {
              allocationId: String(allocation.id),
              demandId: String(allocation.demand_id),
              itemId: String(allocation.item_id),
              materialVariantId: String(allocation.material_variant_id),
              batchId: String(allocation.batch_id),
              quantity: String(line.outboundQuantity),
              unit: allocation.unit_snapshot,
            };
          }),
        },
        context,
      );
      await this.audit(
        connection,
        context,
        'production-material.outbound.create',
        created.id,
        null,
        { outboundNo: created.no, status: 'pending_picking', detailCount: payload.details.length },
      );
      const current = await findBatch(connection, batchId);
      const outbound = await this.read.loadOutbound(connection, created.id);
      return {
        productionBatchId: batchId,
        batchStatus: current.status,
        batchVersion: current.version,
        outbound,
      };
    });
  }

  listOutbounds(batchId: string): Promise<MaterialOutboundItem[]> {
    return this.read.listOutbounds(batchId);
  }

  listOutboundOrders(query: MaterialOutboundQuery): Promise<PageResult<MaterialOutboundItem>> {
    return this.read.listOutboundOrders(query);
  }

  getOutbound(outboundId: string): Promise<MaterialOutboundItem> {
    return this.read.getOutbound(outboundId);
  }

  listOutboundBatchOptions(): Promise<MaterialOutboundBatchOption[]> {
    return this.read.listOutboundBatchOptions();
  }

  listOutboundCandidates(batchId: string): Promise<MaterialOutboundCandidateItem[]> {
    return this.read.listOutboundCandidates(batchId);
  }

  async confirmOutbound(
    outboundId: string,
    version: number,
    context: CommandContext,
  ): Promise<MaterialOutboundCommandResult> {
    return withTransaction(this.pool, async (connection) => {
      if (!context.actorId) throw new ProductionDomainError('INVALID_INPUT', '缺少当前操作人身份');
      const identity = await this.documents.getOutbound(outboundId);
      const lockedBatch = await findBatch(connection, identity.productionBatchId, true);
      const order = await this.documents.getOutbound(outboundId, true);
      if (order.productionBatchId !== identity.productionBatchId)
        throw new ProductionDomainError('CONCURRENT_MODIFICATION', '出库单所属批次已变化');
      if (order.status === 'completed') {
        return {
          productionBatchId: String(order.productionBatchId),
          batchStatus: lockedBatch.status,
          batchVersion: lockedBatch.version,
          outbound: await this.read.loadOutbound(connection, outboundId),
        };
      }
      if (order.status !== 'pending')
        throw new ProductionDomainError('OUTBOUND_CONFIRM_NOT_ALLOWED', '只有待出库单可以确认');
      if (order.version !== version)
        throw new ProductionDomainError('CONCURRENT_MODIFICATION', '出库单已变化，请刷新后重试');
      await connection.query(
        `SELECT id FROM batch_step_records
         WHERE production_batch_id=? ORDER BY step_order_snapshot,id FOR UPDATE`,
        [order.productionBatchId],
      );
      const details = order.details;
      if (details.length === 0)
        throw new ProductionDomainError('INVALID_STATE', '出库单没有可确认明细');
      const allocationIds = [...new Set(details.map((row) => String(row.allocationId)))].sort(
        bigintCompare,
      );
      await lockIds(connection, 'production_item_allocation', allocationIds);
      const [allocations] = await connection.query<AllocationRow[]>(
        `${ALLOCATION_SELECT} WHERE a.id IN (${placeholders(allocationIds)}) ORDER BY a.id FOR UPDATE`,
        allocationIds,
      );
      await hydrateAllocationQuantities(allocations, this.documents, true);
      if (allocations.length !== allocationIds.length)
        throw new ProductionDomainError('OUTBOUND_ALLOCATION_CHANGED', '出库单对应分配已失效');
      // 制单后可能开工；确认时按当前任务状态重做领料资格校验。
      requireMaterialOutboundBatchStatus(lockedBatch.status);
      const itemBatchIds = [...new Set(details.map((row) => String(row.batchId)))].sort(
        bigintCompare,
      );
      const eligibility = await this.productEligibility.requireProductionIssuableReferences({
        references: details.map((row) => ({
          itemId: String(row.itemId),
          materialVariantId: String(row.materialVariantId),
        })),
      });
      if (eligibility.status !== 'success')
        throw new ProductionDomainError(
          eligibility.status === 'not-found' ? 'NOT_FOUND' : 'INVALID_INPUT',
          eligibility.message,
        );
      const lockedStocks = await this.inventory.lockMaterialBatches(itemBatchIds);
      const plan = planMaterialOutboundConfirmation(
        String(order.productionBatchId),
        details,
        allocations.map((allocation) => ({
          id: String(allocation.id),
          productionBatchId: String(allocation.production_batch_id),
          status: allocation.allocation_status,
          assignedQuantity: allocation.assigned_number,
          issuedQuantity: allocation.outbound_quantity,
        })),
      );
      await lockIds(
        connection,
        'production_item_demand',
        plan.demandRequests.map((request) => request.demandId).sort(bigintCompare),
      );
      requireMaterialOutboundStockQuantities(plan.stockRequests, lockedStocks);
      for (const { demandId, quantity } of plan.demandRequests.sort((left, right) =>
        bigintCompare(left.demandId, right.demandId),
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
      await this.documents.completeOutbound(outboundId, version, context);
      const allOutbound = await allDemandsOutbound(connection, String(order.productionBatchId));
      const nextBatchStatus = materialOutboundBatchStatus(lockedBatch.status, allOutbound);
      // 每次需求履约都改变开工预览事实，状态未变时也须使旧预览版本失效。
      const [batchUpdated] = await connection.execute<ResultSetHeader>(
        'UPDATE production_batches SET status=?,version=version+1,updated_by=? WHERE id=? AND status=? AND version=?',
        [
          nextBatchStatus,
          context.actorId,
          order.productionBatchId,
          lockedBatch.status,
          lockedBatch.version,
        ],
      );
      if (batchUpdated.affectedRows !== 1)
        throw new ProductionDomainError('CONCURRENT_MODIFICATION', '生产任务已变化，请刷新后重试');
      const supplementFulfillment = await fulfillReadySupplements(
        connection,
        String(order.productionBatchId),
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
        },
      );
      const batch = await findBatch(connection, String(order.productionBatchId));
      return {
        productionBatchId: String(order.productionBatchId),
        batchStatus: batch.status,
        batchVersion: batch.version,
        outbound: await this.read.loadOutbound(connection, outboundId),
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
      const identity = await this.documents.getOutbound(outboundId);
      await findBatch(connection, identity.productionBatchId, true);
      const order = await this.documents.getOutbound(outboundId, true);
      if (order.status === 'cancelled') return this.read.loadOutbound(connection, outboundId);
      if (order.status !== 'pending')
        throw new ProductionDomainError('OUTBOUND_CANCEL_NOT_ALLOWED', '已确认出库单不能取消');
      if (order.version !== version)
        throw new ProductionDomainError('CONCURRENT_MODIFICATION', '出库单已变化，请刷新后重试');
      await this.documents.cancelOutbound(outboundId, version, reason, 'manual', context);
      await this.audit(
        connection,
        context,
        'production-material.outbound.cancel',
        outboundId,
        { status: 'pending_picking', version },
        { status: 'cancelled', cancelSource: 'manual', reason, version: version + 1 },
      );
      return this.read.loadOutbound(connection, outboundId);
    });
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
