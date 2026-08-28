import { Inject, Injectable } from '@nestjs/common';
import type {
  DemandType,
  InventoryMaterialDemandTraceItem,
  InventoryMaterialDemandTraceQuery,
  InventoryMaterialSupplyDemandItem,
  InventoryMaterialSupplyDemandQuery,
  PageResult,
} from '@company/contracts';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { toBeijingISOString } from '../../../common/time/date-time.js';
import { ProductionSupplyDemandRepository } from '../application/ports/production-supply-demand.repository.js';

@Injectable()
export class MysqlProductionSupplyDemandRepository extends ProductionSupplyDemandRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {
    super();
  }

  async list(
    query: InventoryMaterialSupplyDemandQuery,
  ): Promise<PageResult<InventoryMaterialSupplyDemandItem>> {
    const keywordFilter = query.keyword
      ? ` AND EXISTS (
          SELECT 1 FROM production_item_demand matched
          WHERE matched.item_id=demand.item_id AND matched.business_status='active'
            AND (matched.item_code_snapshot LIKE ? OR matched.item_name_snapshot LIKE ?)
        )`
      : '';
    const keywordParams = query.keyword ? [`%${query.keyword}%`, `%${query.keyword}%`] : [];
    const [[count]] = await this.pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(DISTINCT demand.item_id) total
       FROM production_item_demand demand
       WHERE demand.business_status='active'${keywordFilter}`,
      keywordParams,
    );
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const [rows] = await this.pool.query<SupplyDemandRow[]>(
      `SELECT totals.item_id,representative.item_code_snapshot item_code,
         representative.item_name_snapshot item_name,representative.unit_snapshot unit,
         COALESCE(balance.total_inventory,0) total_inventory,
         COALESCE(balance.available_inventory,0) available_inventory,
         totals.open_demand,
         GREATEST(totals.open_demand-COALESCE(balance.available_inventory,0),0) shortage
       FROM (
         SELECT demand.item_id,SUM(demand.remaining_number) open_demand,
           MAX(demand.id) representative_demand_id
         FROM production_item_demand demand
         WHERE demand.business_status='active'${keywordFilter}
         GROUP BY demand.item_id
       ) totals
       JOIN production_item_demand representative ON representative.id=totals.representative_demand_id
       LEFT JOIN (
         SELECT item_id,SUM(current_quantity) total_inventory,
           SUM(CASE WHEN stock_status='available' AND batch_status='available'
             THEN current_quantity ELSE 0 END) available_inventory
         FROM inventory_item_balance
         GROUP BY item_id
       ) balance ON balance.item_id=totals.item_id
       ORDER BY shortage DESC,item_code,totals.item_id
       LIMIT ? OFFSET ?`,
      [...keywordParams, pageSize, (page - 1) * pageSize],
    );
    return {
      items: rows.map(mapSupplyDemand),
      total: Number(count?.total ?? 0),
      page,
      pageSize,
    };
  }

  async listDemandTrace(
    itemId: string,
    query: InventoryMaterialDemandTraceQuery,
  ): Promise<PageResult<InventoryMaterialDemandTraceItem>> {
    const [[count]] = await this.pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total FROM production_item_demand demand
       WHERE demand.item_id=? AND demand.business_status='active'`,
      [itemId],
    );
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const [rows] = await this.pool.query<DemandTraceRow[]>(
      `SELECT demand.id,demand.item_id,demand.production_batch_id,batch.batch_no,
         work_order.id work_order_id,work_order.work_order_no,demand.demand_type,
         demand.need_number,demand.remaining_number,demand.unit_snapshot,
         demand.parent_demand_id,demand.supplement_id,supplement.supplement_no,
         disposition.disposition_no abnormal_disposition_no,
         material_loss.scrap_no material_loss_scrap_no,demand.created_at
       FROM production_item_demand demand
       JOIN production_batches batch ON batch.id=demand.production_batch_id
       JOIN work_orders work_order ON work_order.id=batch.work_order_id
       LEFT JOIN production_material_supplement supplement ON supplement.id=demand.supplement_id
       LEFT JOIN item_scrap material_loss ON material_loss.id=supplement.material_loss_scrap_id
       LEFT JOIN batch_step_scrap_records step_scrap
         ON step_scrap.id=supplement.step_scrap_record_id
       LEFT JOIN batch_step_abnormal_dispositions disposition
         ON disposition.id=step_scrap.abnormal_disposition_id
       WHERE demand.item_id=? AND demand.business_status='active'
       ORDER BY demand.created_at DESC,demand.id DESC
       LIMIT ? OFFSET ?`,
      [itemId, pageSize, (page - 1) * pageSize],
    );
    return {
      items: rows.map(mapDemandTrace),
      total: Number(count?.total ?? 0),
      page,
      pageSize,
    };
  }
}

type SupplyDemandRow = RowDataPacket & {
  item_id: number;
  item_code: string;
  item_name: string;
  unit: string;
  total_inventory: string;
  available_inventory: string;
  open_demand: string;
  shortage: string;
};

const mapSupplyDemand = (row: SupplyDemandRow): InventoryMaterialSupplyDemandItem => {
  const totalInventory = BigInt(row.total_inventory);
  const availableInventory = BigInt(row.available_inventory);
  const shortage = BigInt(row.shortage);
  return {
    itemId: String(row.item_id),
    itemCode: row.item_code,
    itemName: row.item_name,
    unit: row.unit,
    totalInventoryQuantity: totalInventory.toString(),
    availableInventoryQuantity: availableInventory.toString(),
    unavailableInventoryQuantity: (totalInventory - availableInventory).toString(),
    openDemandQuantity: BigInt(row.open_demand).toString(),
    shortageQuantity: shortage.toString(),
    isShortage: shortage > 0n,
  };
};

type DemandTraceRow = RowDataPacket & {
  id: number;
  item_id: number;
  production_batch_id: number;
  batch_no: string;
  work_order_id: number;
  work_order_no: string;
  demand_type: DemandType;
  need_number: string;
  remaining_number: string | number;
  unit_snapshot: string;
  parent_demand_id: number | null;
  supplement_id: number | null;
  supplement_no: string | null;
  abnormal_disposition_no: string | null;
  material_loss_scrap_no: string | null;
  created_at: Date;
};

const mapDemandTrace = (row: DemandTraceRow): InventoryMaterialDemandTraceItem => ({
  demandId: String(row.id),
  itemId: String(row.item_id),
  productionBatchId: String(row.production_batch_id),
  batchNo: row.batch_no,
  workOrderId: String(row.work_order_id),
  workOrderNo: row.work_order_no,
  demandType: row.demand_type,
  demandQuantity: row.need_number,
  remainingDemandQuantity: String(row.remaining_number),
  unit: row.unit_snapshot,
  parentDemandId: row.parent_demand_id === null ? null : String(row.parent_demand_id),
  supplementId: row.supplement_id === null ? null : String(row.supplement_id),
  supplementNo: row.supplement_no,
  abnormalDispositionNo: row.abnormal_disposition_no,
  materialLossScrapNo: row.material_loss_scrap_no,
  createdAt: toBeijingISOString(row.created_at),
});
