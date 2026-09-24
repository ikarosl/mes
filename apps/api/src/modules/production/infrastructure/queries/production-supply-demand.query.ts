import { currentMaterialNameSql } from './material-name.sql.js';
import type {
  DemandType,
  InventoryMaterialDemandTraceItem,
  InventoryMaterialDemandTraceQuery,
  InventoryMaterialSupplyDemandItem,
  InventoryMaterialSupplyDemandQuery,
  PageResult,
} from '@company/contracts';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { toBeijingISOString } from '../../../../common/time/date-time.js';
import type { MaterialVariantQuery } from '../../../product/public.js';

/** Read-only presentation projection; never used as command eligibility. */
export class ProductionSupplyDemandQueries {
  constructor(
    private readonly pool: Pool,
    private readonly variants: MaterialVariantQuery,
  ) {}

  async list(
    query: InventoryMaterialSupplyDemandQuery,
  ): Promise<PageResult<InventoryMaterialSupplyDemandItem>> {
    // Product decides whether an exact version may be issued; SQL only projects the returned IDs.
    // Resolve before pagination so disabled stock also changes shortage ordering correctly.
    const [stockMaterials] = await this.pool.query<(RowDataPacket & { material_id: number })[]>(
      `SELECT DISTINCT material_id FROM inventory_material_variant_balance
       WHERE current_quantity>0 AND stock_status='available' AND batch_status='available'`,
    );
    const enabledVariants = await this.variants.listEnabledByMaterials(
      stockMaterials.map((row) => String(row.material_id)),
    );
    const enabledIds = enabledVariants.map((variant) => variant.id);
    const issuableVersionSql = enabledIds.length
      ? `material_variant_id IN (${enabledIds.map(() => '?').join(',')})`
      : '1=0';
    const inventorySql = `WITH demand_totals AS (
      SELECT item_id,material_variant_id,SUM(remaining_number) open_demand,
        MAX(id) representative_demand_id
      FROM production_item_demand WHERE business_status='active'
      GROUP BY item_id,material_variant_id
    ), balance_totals AS (
      SELECT material_id item_id,material_variant_id,SUM(current_quantity) total_inventory,
        SUM(CASE WHEN stock_status='available' AND batch_status='available' AND ${issuableVersionSql}
          THEN current_quantity ELSE 0 END) available_inventory
      FROM inventory_material_variant_balance
      GROUP BY material_id,material_variant_id HAVING SUM(current_quantity)>0
    ), identities AS (
      SELECT item_id,material_variant_id FROM demand_totals
      UNION SELECT item_id,material_variant_id FROM balance_totals
    ), inventory AS (
      SELECT identity.item_id,identity.material_variant_id,
        COALESCE(demand.material_variant_code_snapshot,batch.material_variant_code_snapshot) material_variant_code,
        COALESCE(demand.item_code_snapshot,batch.item_code_snapshot) item_code,
        ${currentMaterialNameSql('identity.item_id')} item_name,
        COALESCE(demand.unit_snapshot,batch.unit_snapshot) unit,
        COALESCE(balance.total_inventory,0) total_inventory,
        COALESCE(balance.available_inventory,0) available_inventory,
        COALESCE(totals.open_demand,0) open_demand,
        GREATEST(COALESCE(totals.open_demand,0)-COALESCE(balance.available_inventory,0),0) shortage
      FROM identities identity
      LEFT JOIN demand_totals totals ON totals.item_id=identity.item_id
        AND totals.material_variant_id=identity.material_variant_id
      LEFT JOIN production_item_demand demand ON demand.id=totals.representative_demand_id
      LEFT JOIN balance_totals balance ON balance.item_id=identity.item_id
        AND balance.material_variant_id=identity.material_variant_id
      LEFT JOIN item_batch batch ON batch.id=(
        SELECT MAX(ib.id) FROM item_batch ib WHERE ib.product_id IS NULL AND ib.item_id=identity.item_id
          AND ib.material_variant_id=identity.material_variant_id
      )
    )`;
    const keywordFilter = query.keyword
      ? ` WHERE (item_code LIKE ? OR item_name LIKE ? OR material_variant_code LIKE ?
          OR EXISTS (
            SELECT 1 FROM production_item_demand matched
            WHERE matched.item_id=inventory.item_id
              AND matched.material_variant_id=inventory.material_variant_id
              AND matched.business_status='active'
              AND (matched.item_code_snapshot LIKE ? OR ${currentMaterialNameSql('matched.item_id')} LIKE ?
                OR matched.material_variant_code_snapshot LIKE ?)
          ))`
      : '';
    const keywordParams = query.keyword ? Array<string>(6).fill(`%${query.keyword}%`) : [];
    const [[count]] = await this.pool.query<(RowDataPacket & { total: number })[]>(
      `${inventorySql} SELECT COUNT(*) total FROM inventory${keywordFilter}`,
      [...enabledIds, ...keywordParams],
    );
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const [rows] = await this.pool.query<SupplyDemandRow[]>(
      `${inventorySql}
       SELECT item_id,material_variant_id,material_variant_code,item_code,item_name,unit,
         total_inventory,available_inventory,open_demand,shortage
       FROM inventory${keywordFilter}
       ORDER BY (open_demand>0) DESC,shortage DESC,item_code,item_id,material_variant_id
       LIMIT ? OFFSET ?`,
      [...enabledIds, ...keywordParams, pageSize, (page - 1) * pageSize],
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
       WHERE demand.item_id=? AND demand.material_variant_id=? AND demand.business_status='active'`,
      [itemId, query.materialVariantId],
    );
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const [rows] = await this.pool.query<DemandTraceRow[]>(
      `SELECT demand.id,demand.item_id,demand.material_variant_id,demand.material_variant_code_snapshot material_variant_code,demand.production_batch_id,batch.batch_no,
         work_order.id work_order_id,work_order.work_order_no,demand.demand_type,
         demand.need_number,demand.remaining_number,demand.unit_snapshot,demand.pending_correction_id,demand.replaces_demand_id,
         demand.parent_demand_id,demand.supplement_id,supplement.supplement_no,
         disposition.disposition_no abnormal_disposition_no,demand.created_at
       FROM production_item_demand demand
       JOIN production_batches batch ON batch.id=demand.production_batch_id
       JOIN work_orders work_order ON work_order.id=batch.work_order_id
       LEFT JOIN production_material_supplement supplement ON supplement.id=demand.supplement_id
       LEFT JOIN batch_step_scrap_records step_scrap
         ON step_scrap.id=supplement.step_scrap_record_id
       LEFT JOIN batch_step_abnormal_dispositions disposition
         ON disposition.id=step_scrap.abnormal_disposition_id
       WHERE demand.item_id=? AND demand.material_variant_id=? AND demand.business_status='active'
       ORDER BY demand.created_at DESC,demand.id DESC
       LIMIT ? OFFSET ?`,
      [itemId, query.materialVariantId, pageSize, (page - 1) * pageSize],
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
  material_variant_id: number;
  material_variant_code: string;
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
    materialVariantId: String(row.material_variant_id),
    materialVariantCode: row.material_variant_code,
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
  pending_correction_id: number | null;
  replaces_demand_id: number | null;
  item_id: number;
  material_variant_id: number;
  material_variant_code: string;
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
  created_at: Date;
};

const mapDemandTrace = (row: DemandTraceRow): InventoryMaterialDemandTraceItem => ({
  demandId: String(row.id),
  pendingCorrectionId: row.pending_correction_id == null ? null : String(row.pending_correction_id),
  replacesDemandId: row.replaces_demand_id == null ? null : String(row.replaces_demand_id),
  itemId: String(row.item_id),
  materialVariantId: String(row.material_variant_id),
  materialVariantCode: row.material_variant_code,
  productionBatchId: String(row.production_batch_id),
  batchNo: row.batch_no,
  workOrderId: String(row.work_order_id),
  workOrderNo: row.work_order_no,
  demandType: row.demand_type,
  demandQuantity: String(row.need_number),
  remainingDemandQuantity: String(row.remaining_number),
  unit: row.unit_snapshot,
  parentDemandId: row.parent_demand_id === null ? null : String(row.parent_demand_id),
  supplementId: row.supplement_id === null ? null : String(row.supplement_id),
  supplementNo: row.supplement_no,
  abnormalDispositionNo: row.abnormal_disposition_no,
  createdAt: toBeijingISOString(row.created_at),
});
