import { materialOutboundDetailsSql } from './queries/material-outbound-details.sql.js';
import {
  MATERIAL_OUTBOUND_ORDER_SELECT as OUTBOUND_SELECT,
  MATERIAL_OUTBOUND_ORDER_COUNT,
} from './queries/material-outbound-orders.sql.js';
import { hydrateAllocationQuantities } from './mysql-production-material-facts.js';
import { MaterialVariantQuery, ProductInventoryEligibility } from '../../product/public.js';
import {
  InventoryStockCommand,
  InventoryProductionDocumentCommand,
} from '../../inventory/public.js';
import { currentMaterialNameSql } from './queries/material-name.sql.js';
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
  MATERIAL_OPERATION_BATCH_STATUSES,
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
import { lockIds } from './mysql-production-material-persistence.js';
import { findBatch } from './mysql-production.shared.js';
import { fulfillReadySupplements } from './mysql-production-supplement-activation.js';

@Injectable()
export class MysqlProductionMaterialOutboundRepository extends ProductionMaterialOutboundRepository {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly inventory: InventoryStockCommand,
    private readonly productEligibility: ProductInventoryEligibility,
    private readonly variants: MaterialVariantQuery,
    private readonly documents: InventoryProductionDocumentCommand,
  ) {
    super();
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
      const outbound = await this.loadOutbound(connection, created.id);
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
      `${OUTBOUND_SELECT} WHERE o.source_type='production_material' AND o.production_batch_id=? ORDER BY o.created_at DESC,o.id DESC`,
      [batchId],
    );
    return this.loadOutbounds(this.pool, rows);
  }

  async listOutboundOrders(
    query: MaterialOutboundQuery,
  ): Promise<PageResult<MaterialOutboundItem>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const conditions = ["o.source_type='production_material'"];
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
      `${MATERIAL_OUTBOUND_ORDER_COUNT} WHERE ${where}`,
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
       WHERE b.status IN (${placeholders([...MATERIAL_OPERATION_BATCH_STATUSES])})
         AND EXISTS (
           SELECT 1 FROM production_item_demand demand
           WHERE demand.production_batch_id=b.id AND demand.business_status='active'
             AND demand.remaining_number>0
         )
       ORDER BY b.created_at DESC,b.id DESC`,
      [...MATERIAL_OPERATION_BATCH_STATUSES],
    );
    if (rows.length === 0) return [];
    const batchIds = rows.map((row) => String(row.id));
    const [allocations] = await this.pool.query<AllocationRow[]>(
      `${ALLOCATION_SELECT} WHERE a.production_batch_id IN (${placeholders(batchIds)})
       AND a.allocation_status='active' AND d.business_status='active'
       AND d.remaining_number>0 AND d.pending_correction_id IS NULL`,
      batchIds,
    );
    await hydrateAllocationQuantities(allocations, this.documents);
    const enabledVariants = new Set(
      (
        await this.variants.listEnabledByMaterials([
          ...new Set(allocations.map((row) => String(row.item_id))),
        ])
      ).map((row) => row.id),
    );
    const stockBatches = new Map(
      (
        await this.inventory.materialBatchReferences([
          ...new Set(allocations.map((row) => String(row.batch_id))),
        ])
      ).map((row) => [row.id, row]),
    );
    const byBatch = new Map<string, AllocationRow[]>();
    for (const allocation of allocations) {
      const stock = stockBatches.get(String(allocation.batch_id));
      if (
        !enabledVariants.has(String(allocation.material_variant_id)) ||
        stock?.batchStatus !== 'available' ||
        stock.itemId !== String(allocation.item_id) ||
        stock.materialVariantId !== String(allocation.material_variant_id)
      )
        continue;
      const batchId = String(allocation.production_batch_id);
      const values = byBatch.get(batchId) ?? [];
      values.push(allocation);
      byBatch.set(batchId, values);
    }
    return rows.map((row) => {
      const active = byBatch.get(String(row.id)) ?? [];
      return {
        productionBatchId: String(row.id),
        batchNo: row.batch_no,
        workOrderNo: row.work_order_no,
        productCode: row.product_code,
        productName: row.product_name,
        batchStatus: row.status,
        outboundEligibility: evaluateMaterialOutboundEligibility({
          batchStatus: row.status,
          hasActiveAllocation: active.some(
            (allocation) =>
              integerQuantity(allocation.assigned_number) >
              integerQuantity(allocation.outbound_quantity),
          ),
          hasOrderableAllocation: active.some(
            (allocation) =>
              integerQuantity(allocation.assigned_number) >
              integerQuantity(allocation.outbound_quantity) +
                integerQuantity(allocation.pending_outbound_quantity),
          ),
        }),
      };
    });
  }

  async listOutboundCandidates(batchId: string): Promise<MaterialOutboundCandidateItem[]> {
    const batch = await findBatch(this.pool, batchId);
    if (!MATERIAL_OPERATION_BATCH_STATUSES.includes(batch.status)) return [];
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
      )} WHERE a.production_batch_id=? AND a.allocation_status='active' AND d.business_status='active' AND d.remaining_number>0 AND d.pending_correction_id IS NULL ORDER BY d.id,a.id`,
      [batchId],
    );
    await hydrateAllocationQuantities(rows, this.documents);
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
          outbound: await this.loadOutbound(connection, outboundId),
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
      const byAllocation = new Map(allocations.map((row) => [String(row.id), row]));
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
      const lockedStocks = new Map(
        (await this.inventory.lockMaterialBatches(itemBatchIds)).map((row) => [row.id, row]),
      );
      const requestedByBatch = new Map<
        string,
        { itemId: string; materialVariantId: string; quantity: number }
      >();
      const requestedByDemand = new Map<string, number>();
      for (const detail of details) {
        const allocation = byAllocation.get(String(detail.allocationId));
        if (
          !allocation ||
          allocation.allocation_status !== 'active' ||
          String(allocation.production_batch_id) !== String(order.productionBatchId)
        )
          throw new ProductionDomainError('OUTBOUND_ALLOCATION_CHANGED', '出库单对应分配已失效');
        if (
          integerQuantity(allocation.outbound_quantity) + integerQuantity(detail.quantity) >
          integerQuantity(allocation.assigned_number)
        )
          throw new ProductionDomainError('OUTBOUND_EXCEEDS_ALLOCATION', '出库数量超过分配剩余量');
        const key = String(detail.batchId);
        const current = requestedByBatch.get(key);
        requestedByBatch.set(key, {
          itemId: detail.itemId,
          materialVariantId: detail.materialVariantId,
          quantity: (current?.quantity ?? 0) + integerQuantity(detail.quantity),
        });
        const demandId = String(detail.demandId);
        requestedByDemand.set(
          demandId,
          (requestedByDemand.get(demandId) ?? 0) + integerQuantity(detail.quantity),
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
      await this.documents.completeOutbound(outboundId, version, context);
      const allOutbound = await allDemandsOutbound(connection, String(order.productionBatchId));
      const nextMaterialStatus = allOutbound ? 'material_outbound' : 'material_partially_outbound';
      let nextBatchStatus = lockedBatch.status;
      if (
        (allOutbound &&
          ['material_pending', 'material_assigned', 'material_partially_outbound'].includes(
            lockedBatch.status,
          )) ||
        (!allOutbound && ['material_pending', 'material_assigned'].includes(lockedBatch.status))
      ) {
        requireBatchTransition(lockedBatch.status, nextMaterialStatus);
        nextBatchStatus = nextMaterialStatus;
      }
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
      const identity = await this.documents.getOutbound(outboundId);
      await findBatch(connection, identity.productionBatchId, true);
      const order = await this.documents.getOutbound(outboundId, true);
      if (order.status === 'cancelled') return this.loadOutbound(connection, outboundId);
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
      const [[found]] = await db.query<OutboundRow[]>(
        `${OUTBOUND_SELECT} WHERE o.source_type='production_material' AND o.id=?`,
        [id],
      );
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

const summarizeQuantities = (details: OutboundDetailRow[]) => {
  const byUnit = new Map<string, number>();
  for (const detail of details)
    byUnit.set(
      detail.unit_snapshot,
      (byUnit.get(detail.unit_snapshot) ?? 0) + integerQuantity(detail.outbound_number),
    );
  return [...byUnit.entries()].map(([unit, quantity]) => ({ unit, quantity: decimal(quantity) }));
};
