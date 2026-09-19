import { Inject, Injectable } from '@nestjs/common';
import { withActiveConnection } from '@company/database';
import type {
  PageResult,
  ProcurementDemandCandidate,
  ProcurementDemandCandidateQuery,
  ProcurementDemandResolution,
} from '@company/contracts';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { MaterialVariantQuery } from '../../product/public.js';
import {
  ProductionProcurementQuery,
  type ProductionProcurementResult,
} from '../application/production-procurement.query.js';
import {
  readCandidateMaterialIds,
  readDemandCandidatePage,
  readDemandMaterialNames,
  readDemandReferences,
} from './queries/procurement-demand.query.js';

type LocatorRow = RowDataPacket & {
  id: number | string;
  production_batch_id: number | string;
  work_order_id: number | string;
};
type WorkOrderRow = RowDataPacket & {
  id: number | string;
  work_order_no: string;
  status: ProcurementDemandCandidate['workOrderStatus'];
};
type BatchRow = RowDataPacket & {
  id: number | string;
  work_order_id: number | string;
  batch_no: string;
  status: ProcurementDemandCandidate['batchStatus'];
};
type DemandRow = RowDataPacket & {
  id: number | string;
  production_batch_id: number | string;
  item_id: number | string;
  item_code_snapshot: string;
  material_variant_id: number | string;
  material_variant_code_snapshot: string;
  unit_snapshot: string;
  demand_type: ProcurementDemandCandidate['demandType'];
  need_number: string;
  remaining_number: string;
  business_status: ProcurementDemandCandidate['businessStatus'];
  pending_correction_id: number | string | null;
};

@Injectable()
export class MysqlProductionProcurementQuery extends ProductionProcurementQuery {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly variants: MaterialVariantQuery,
  ) {
    super();
  }

  listCandidates(
    query: ProcurementDemandCandidateQuery,
  ): Promise<PageResult<ProcurementDemandCandidate>> {
    return withActiveConnection(this.pool, async (db) => {
      const materialIds = await readCandidateMaterialIds(db, query);
      const variants = materialIds.length
        ? await this.variants.listPurchasableByMaterials({ materialIds })
        : [];
      return readDemandCandidatePage(
        db,
        query,
        variants.map((variant) => variant.id),
      );
    });
  }

  resolveDemands(input: { demandIds: string[] }): Promise<ProcurementDemandResolution[]> {
    if (!validIds(input.demandIds)) throw new RangeError('需求解析必须提交 1 至 100 个有效需求 ID');
    return withActiveConnection(this.pool, async (db) => {
      const demands = await readDemandReferences(db, sortedIds(input.demandIds));
      const materialIds = [...new Set(demands.map((demand) => demand.itemId))];
      const variants = materialIds.length
        ? await this.variants.listPurchasableByMaterials({ materialIds })
        : [];
      const purchasableVariants = new Set(variants.map((variant) => variant.id));
      const byId = new Map(demands.map((demand) => [demand.demandId, demand]));
      return input.demandIds.map((demandId) => {
        const demand = byId.get(demandId) ?? null;
        const blockedReason = demand
          ? (productionBlock(demand) ??
            (purchasableVariants.has(demand.materialVariantId)
              ? null
              : '基础物料或分类已停用、已删除，或该精确版本已删除'))
          : '需求不存在';
        return { demandId, demand, eligible: blockedReason === null, blockedReason };
      });
    });
  }

  requirePurchasableDemands(input: {
    demandIds: string[];
  }): Promise<ProductionProcurementResult<ProcurementDemandCandidate[]>> {
    if (!validIds(input.demandIds))
      return Promise.resolve({ status: 'invalid-input', message: '需提交 1 至 100 个有效需求 ID' });
    return withActiveConnection(this.pool, async (db) => {
      if (db === this.pool) throw new Error('采购来源复核必须位于调用方同池事务中');
      const ids = sortedIds(input.demandIds);
      const [locators] = await db.query<LocatorRow[]>(
        `SELECT d.id,d.production_batch_id,b.work_order_id FROM production_item_demand d
         JOIN production_batches b ON b.id=d.production_batch_id
         WHERE d.id IN (${placeholders(ids)}) ORDER BY d.id`,
        ids,
      );
      if (locators.length !== ids.length)
        return { status: 'not-found', message: '采购来源需求不存在' };
      const workOrderIds = sortedIds(locators.map((row) => String(row.work_order_id)));
      const batchIds = sortedIds(locators.map((row) => String(row.production_batch_id)));
      const [workOrders] = await db.query<WorkOrderRow[]>(
        `SELECT id,work_order_no,status FROM work_orders WHERE id IN (${placeholders(workOrderIds)}) ORDER BY id FOR SHARE`,
        workOrderIds,
      );
      const [batches] = await db.query<BatchRow[]>(
        `SELECT id,work_order_id,batch_no,status FROM production_batches WHERE id IN (${placeholders(batchIds)}) ORDER BY id FOR SHARE`,
        batchIds,
      );
      const [demands] = await db.query<DemandRow[]>(
        `SELECT id,production_batch_id,item_id,item_code_snapshot,material_variant_id,
         material_variant_code_snapshot,unit_snapshot,demand_type,need_number,remaining_number,
         business_status,pending_correction_id FROM production_item_demand
         WHERE id IN (${placeholders(ids)}) ORDER BY id FOR SHARE`,
        ids,
      );
      const workOrderById = new Map(workOrders.map((row) => [String(row.id), row]));
      const batchById = new Map(batches.map((row) => [String(row.id), row]));
      const locatorById = new Map(locators.map((row) => [String(row.id), row]));
      const names = await readDemandMaterialNames(
        db,
        sortedIds(demands.map((row) => String(row.item_id))),
      );
      const result: ProcurementDemandCandidate[] = [];
      if (demands.length !== ids.length)
        return { status: 'not-found', message: '采购来源需求不存在' };
      for (const row of demands) {
        const demandId = String(row.id);
        const locator = locatorById.get(demandId)!;
        const batch = batchById.get(String(row.production_batch_id));
        const workOrder = batch && workOrderById.get(String(batch.work_order_id));
        if (
          !batch ||
          !workOrder ||
          String(row.production_batch_id) !== String(locator.production_batch_id) ||
          String(batch.work_order_id) !== String(locator.work_order_id)
        )
          return {
            status: 'concurrent-modification',
            message: '需求所属工单或任务已变化，请刷新后重试',
            demandId,
          };
        const demand: ProcurementDemandCandidate = {
          demandId,
          workOrderId: String(workOrder.id),
          workOrderNo: workOrder.work_order_no,
          workOrderStatus: workOrder.status,
          productionBatchId: String(batch.id),
          batchNo: batch.batch_no,
          batchStatus: batch.status,
          itemId: String(row.item_id),
          itemCode: row.item_code_snapshot,
          itemName: names.get(String(row.item_id)) ?? '',
          materialVariantId: String(row.material_variant_id),
          materialVariantCode: row.material_variant_code_snapshot,
          unit: row.unit_snapshot,
          demandType: row.demand_type,
          demandQuantity: String(row.need_number),
          remainingDemandQuantity: String(row.remaining_number),
          businessStatus: row.business_status,
          pendingCorrectionId:
            row.pending_correction_id === null ? null : String(row.pending_correction_id),
        };
        const blockedReason = productionBlock(demand);
        if (blockedReason) return { status: 'not-purchasable', message: blockedReason, demandId };
        result.push(demand);
      }
      return { status: 'success', value: result };
    });
  }
}

function productionBlock(demand: ProcurementDemandCandidate): string | null {
  if (!['released', 'doing'].includes(demand.workOrderStatus))
    return '工单尚未下达或已结束，不能作为新采购来源';
  if (
    ![
      'material_pending',
      'material_assigned',
      'material_partially_outbound',
      'material_outbound',
      'doing',
    ].includes(demand.batchStatus)
  )
    return '生产任务不在可采购状态';
  if (demand.businessStatus !== 'active') return '需求已满足、关闭或取消，不能作为新采购来源';
  if (Number(demand.remainingDemandQuantity) <= 0) return '需求没有尚未领用的剩余数量';
  if (demand.pendingCorrectionId !== null) return '需求正在更正审批，暂不能作为新采购来源';
  return null;
}

const validIds = (ids: string[]): boolean =>
  ids.length > 0 && ids.length <= 100 && ids.every((id) => /^[1-9]\d*$/.test(id));
const sortedIds = (ids: string[]): string[] =>
  [...new Set(ids)].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0));
const placeholders = (ids: string[]): string => ids.map(() => '?').join(',');
