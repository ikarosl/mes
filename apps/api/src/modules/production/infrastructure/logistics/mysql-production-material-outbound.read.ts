import { materialOutboundDetailsSql } from '../queries/logistics/material-outbound-details.sql.js';
import {
  MATERIAL_OUTBOUND_ORDER_SELECT as OUTBOUND_SELECT,
  MATERIAL_OUTBOUND_ORDER_COUNT,
} from '../queries/logistics/material-outbound-orders.sql.js';
import { currentMaterialNameSql } from '../queries/shared/material-name.sql.js';
import { hydrateAllocationQuantities } from '../demand/mysql-production-material-facts.js';
import type { MaterialVariantQuery } from '../../../product/public.js';
import type {
  InventoryStockCommand,
  InventoryProductionDocumentCommand,
} from '../../../inventory/public.js';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import type {
  MaterialOutboundItem,
  MaterialOutboundQuery,
  MaterialOutboundBatchOption,
  MaterialOutboundCandidateItem,
  PageResult,
} from '@company/contracts';
import { toBeijingISOString } from '../../../../common/time/date-time.js';
import { ProductionDomainError } from '../../domain/production.errors.js';
import { integerQuantity } from '../../domain/integer-quantity.js';
import { evaluateMaterialOutboundEligibility } from '../../domain/production-material-outbound-eligibility.js';
import { materialOutboundAvailableQuantities } from '../../domain/production-material-outbound.policy.js';
import { MATERIAL_OPERATION_BATCH_STATUSES } from '../../domain/production-material.policy.js';
import {
  ALLOCATION_SELECT,
  decimal,
  placeholders,
  type AllocationRow,
  type OutboundDetailRow,
  type OutboundRow,
} from '../demand/mysql-production-material.mapper.js';
import { findBatch } from '../tasks/mysql-production-batch.persistence.js';

/** 仅组装展示；命令的状态、版本及数量资格继续由锁内当前事实决定。 */
export class MysqlProductionMaterialOutboundRead {
  constructor(
    private readonly pool: Pool,
    private readonly inventory: InventoryStockCommand,
    private readonly variants: MaterialVariantQuery,
    private readonly documents: InventoryProductionDocumentCommand,
  ) {}

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
        const quantities = materialOutboundAvailableQuantities({
          assignedQuantity: row.assigned_number,
          issuedQuantity: row.outbound_quantity,
          pendingQuantity: row.pending_outbound_quantity,
        });
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
          availableToOrderQuantity: decimal(quantities.orderableQuantity),
          remainingActualOutboundQuantity: decimal(quantities.remainingQuantity),
          unit: row.unit_snapshot,
        };
      })
      .filter((row) => Number(row.availableToOrderQuantity) > 0);
  }

  async loadOutbound(
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
}

const summarizeQuantities = (details: OutboundDetailRow[]) => {
  const byUnit = new Map<string, number>();
  for (const detail of details)
    byUnit.set(
      detail.unit_snapshot,
      (byUnit.get(detail.unit_snapshot) ?? 0) + integerQuantity(detail.outbound_number),
    );
  return [...byUnit.entries()].map(([unit, quantity]) => ({ unit, quantity: decimal(quantity) }));
};
