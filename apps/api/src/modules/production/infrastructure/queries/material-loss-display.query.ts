import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { MaterialLossItem, MaterialLossQuery, PageResult } from '@company/contracts';
import { toBeijingISOString } from '../../../../common/time/date-time.js';
import { ProductionDomainError } from '../../domain/production.errors.js';
import { pagination, iso } from '../mysql-production-inventory.shared.js';
import { currentMaterialNameSql } from './material-name.sql.js';

type MaterialLossRow = RowDataPacket & {
  id: number;
  scrap_no: string;
  production_batch_id: number;
  batch_no: string;
  work_order_id: number;
  work_order_no: string;
  product_code: string;
  product_name: string;
  allocation_id: number;
  demand_id: number;
  item_id: number;
  material_variant_id: number;
  batch_id: number;
  item_code_snapshot: string;
  item_name: string;
  material_variant_code_snapshot: string;
  batch_code: string;
  scrap_number: string;
  unit_snapshot: string;
  reason_type: string;
  loss_purpose: MaterialLossItem['purpose'];
  closeout_id: number | null;
  status: MaterialLossItem['status'];
  confirmed_by: number | null;
  confirmed_at: Date | null;
  created_by: number;
  created_at: Date;
  version: number;
  remark: string | null;
  cancel_reason: string | null;
  cancelled_by: number | null;
  cancelled_at: Date | null;
};

const MATERIAL_LOSS_SELECT = `SELECT scrap.id,scrap.scrap_no,scrap.production_batch_id,
  pb.batch_no,pb.work_order_id,wo.work_order_no,wo.product_code_snapshot product_code,
  wo.product_name_snapshot product_name,scrap.allocation_id,scrap.demand_id,scrap.item_id,
  scrap.material_variant_id,scrap.batch_id,ib.item_code_snapshot,${currentMaterialNameSql('ib.item_id')} item_name,
  ib.material_variant_code_snapshot,ib.batch_code,
  scrap.scrap_number,scrap.unit_snapshot,scrap.reason_type,scrap.loss_purpose,scrap.closeout_id,scrap.status,scrap.confirmed_by,
  scrap.confirmed_at,scrap.created_by,scrap.created_at,scrap.version,scrap.remark,
  scrap.cancel_reason,scrap.cancelled_by,scrap.cancelled_at
 FROM item_scrap scrap
 JOIN production_batches pb ON pb.id=scrap.production_batch_id
 JOIN work_orders wo ON wo.id=pb.work_order_id
 JOIN item_batch ib ON ib.id=scrap.batch_id`;

export async function listMaterialLossDisplay(
  db: Pool | PoolConnection,
  query: MaterialLossQuery,
): Promise<PageResult<MaterialLossItem>> {
  const where = ["scrap.scrap_scene='production_consumed'"];
  const params: Array<string | number> = [];
  if (query.keyword) {
    where.push(
      `(scrap.scrap_no LIKE ? OR pb.batch_no LIKE ? OR wo.work_order_no LIKE ? OR ib.item_code_snapshot LIKE ? OR ${currentMaterialNameSql('ib.item_id')} LIKE ?)`,
    );
    params.push(...Array(5).fill(`%${query.keyword}%`));
  }
  if (query.status) {
    where.push('scrap.status=?');
    params.push(query.status);
  }
  const clause = ` WHERE ${where.join(' AND ')}`;
  const [[count]] = await db.query<(RowDataPacket & { total: number })[]>(
    `SELECT COUNT(*) total FROM item_scrap scrap
       JOIN production_batches pb ON pb.id=scrap.production_batch_id
       JOIN work_orders wo ON wo.id=pb.work_order_id
       JOIN item_batch ib ON ib.id=scrap.batch_id${clause}`,
    params,
  );
  const { page, pageSize, offset } = pagination(query);
  const [rows] = await db.query<MaterialLossRow[]>(
    `${MATERIAL_LOSS_SELECT}${clause} ORDER BY scrap.id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  );
  return { items: rows.map(mapMaterialLoss), total: Number(count?.total ?? 0), page, pageSize };
}

/** Presentation only: command eligibility reads Production-owned facts separately. */
export async function readMaterialLossDisplay(
  db: Pool | PoolConnection,
  id: string,
): Promise<MaterialLossItem> {
  const [[row]] = await db.query<MaterialLossRow[]>(`${MATERIAL_LOSS_SELECT} WHERE scrap.id=?`, [
    id,
  ]);
  if (!row) throw new ProductionDomainError('NOT_FOUND', '生产领料损耗来源不存在');
  return mapMaterialLoss(row);
}

export interface MaterialLossBatchDisplay {
  itemCode: string;
  itemName: string;
  materialVariantCode: string;
  batchCode: string;
}

export async function readMaterialLossBatchDisplays(
  db: Pool | PoolConnection,
  batchIds: string[],
): Promise<Map<string, MaterialLossBatchDisplay>> {
  const ids = [...new Set(batchIds)];
  if (ids.length === 0) return new Map();
  const [rows] = await db.query<
    (RowDataPacket & {
      id: number;
      item_code_snapshot: string;
      item_name: string;
      material_variant_code_snapshot: string;
      batch_code: string;
    })[]
  >(
    `SELECT ib.id,ib.item_code_snapshot,${currentMaterialNameSql('ib.item_id')} item_name,
      ib.material_variant_code_snapshot,ib.batch_code
     FROM item_batch ib WHERE ib.id IN (${ids.map(() => '?').join(',')})`,
    ids,
  );
  return new Map(
    rows.map((row) => [
      String(row.id),
      {
        itemCode: row.item_code_snapshot,
        itemName: row.item_name,
        materialVariantCode: row.material_variant_code_snapshot,
        batchCode: row.batch_code,
      },
    ]),
  );
}

export function requireMaterialLossBatchDisplay(
  displays: ReadonlyMap<string, MaterialLossBatchDisplay>,
  batchId: string,
): MaterialLossBatchDisplay {
  const display = displays.get(batchId);
  if (!display) throw new ProductionDomainError('NOT_FOUND', '生产领料损耗来源不存在');
  return display;
}

const mapMaterialLoss = (row: MaterialLossRow): MaterialLossItem => ({
  id: String(row.id),
  scrapNo: row.scrap_no,
  productionBatchId: String(row.production_batch_id),
  batchNo: row.batch_no,
  workOrderId: String(row.work_order_id),
  workOrderNo: row.work_order_no,
  productCode: row.product_code,
  productName: row.product_name,
  allocationId: String(row.allocation_id),
  demandId: String(row.demand_id),
  itemId: String(row.item_id),
  materialVariantId: String(row.material_variant_id),
  materialVariantCode: row.material_variant_code_snapshot,
  itemCode: row.item_code_snapshot,
  itemName: row.item_name,
  itemBatchId: String(row.batch_id),
  batchCode: row.batch_code,
  scrapScene: 'production_consumed',
  purpose: row.loss_purpose,
  closeoutId: row.closeout_id === null ? null : String(row.closeout_id),
  scrapQuantity: String(row.scrap_number),
  unit: row.unit_snapshot,
  reasonType: row.reason_type,
  status: row.status,
  confirmedById: row.confirmed_by === null ? null : String(row.confirmed_by),
  confirmedByName: null,
  confirmedAt: iso(row.confirmed_at),
  createdById: String(row.created_by),
  createdByName: null,
  createdAt: toBeijingISOString(row.created_at),
  version: row.version,
  remark: row.remark,
  cancelReason: row.cancel_reason,
  cancelledById: row.cancelled_by === null ? null : String(row.cancelled_by),
  cancelledByName: null,
  cancelledAt: iso(row.cancelled_at),
});
