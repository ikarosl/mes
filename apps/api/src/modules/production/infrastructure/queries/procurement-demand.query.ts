import type {
  PageResult,
  ProcurementDemandCandidate,
  ProcurementDemandCandidateQuery,
  ProcurementDemandWorkOrder,
  ProcurementDemandWorkOrderQuery,
} from '@company/contracts';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { currentMaterialNameSql } from './material-name.sql.js';

type Db = Pool | PoolConnection;
type DemandRow = RowDataPacket & ProcurementDemandCandidate;

const demandSelect = `SELECT CAST(d.id AS CHAR) demandId,
  CAST(w.id AS CHAR) workOrderId,w.work_order_no workOrderNo,w.status workOrderStatus,
  CAST(b.id AS CHAR) productionBatchId,b.batch_no batchNo,b.status batchStatus,
  CAST(d.item_id AS CHAR) itemId,d.item_code_snapshot itemCode,
  ${currentMaterialNameSql('d.item_id')} itemName,
  CAST(d.material_variant_id AS CHAR) materialVariantId,
  d.material_variant_code_snapshot materialVariantCode,d.unit_snapshot unit,
  d.demand_type demandType,d.need_number demandQuantity,d.remaining_number remainingDemandQuantity,
  d.business_status businessStatus,CAST(d.pending_correction_id AS CHAR) pendingCorrectionId,
  COALESCE(basis.supplier_hint,d.supplier_hint) supplierHint
  FROM production_item_demand d JOIN production_batches b ON b.id=d.production_batch_id
  JOIN work_orders w ON w.id=b.work_order_id
  LEFT JOIN production_material_requirement_basis basis ON basis.id=d.requirement_basis_id`;

function candidateFilter(query: Partial<ProcurementDemandCandidateQuery>): {
  sql: string;
  values: string[];
} {
  const filters = [
    "w.status IN ('released','doing')",
    "b.status IN ('material_pending','material_assigned','material_partially_outbound','material_outbound','doing')",
    "d.business_status='active'",
    'd.remaining_number>0',
    'd.pending_correction_id IS NULL',
  ];
  const values: string[] = [];
  for (const [column, value] of [
    ['w.id', query.workOrderId],
    ['b.id', query.batchId],
    ['d.item_id', query.itemId],
    ['d.demand_type', query.demandType],
  ]) {
    if (!value) continue;
    filters.push(`${column}=?`);
    values.push(value);
  }
  if (query.keyword?.trim()) {
    filters.push(`(w.work_order_no LIKE ? OR b.batch_no LIKE ? OR d.item_code_snapshot LIKE ?
      OR d.material_variant_code_snapshot LIKE ? OR ${currentMaterialNameSql('d.item_id')} LIKE ?)`);
    values.push(...Array<string>(5).fill(`%${query.keyword.trim()}%`));
  }
  return { sql: filters.join(' AND '), values };
}

export async function readCandidateMaterialIds(
  db: Db,
  query: Partial<ProcurementDemandCandidateQuery>,
): Promise<string[]> {
  const where = candidateFilter(query);
  const [rows] = await db.query<(RowDataPacket & { item_id: number | string })[]>(
    `SELECT DISTINCT d.item_id FROM production_item_demand d
     JOIN production_batches b ON b.id=d.production_batch_id
     JOIN work_orders w ON w.id=b.work_order_id WHERE ${where.sql} ORDER BY d.item_id`,
    where.values,
  );
  return rows.map((row) => String(row.item_id));
}

export async function readDemandCandidatePage(
  db: Db,
  query: ProcurementDemandCandidateQuery,
  variantIds: string[],
): Promise<PageResult<ProcurementDemandCandidate>> {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 10));
  if (!variantIds.length) return { items: [], total: 0, page, pageSize };
  const where = candidateFilter(query);
  where.sql += ` AND d.material_variant_id IN (${variantIds.map(() => '?').join(',')})`;
  where.values.push(...variantIds);
  const [[count]] = await db.query<(RowDataPacket & { total: number | string })[]>(
    `SELECT COUNT(*) total FROM production_item_demand d
     JOIN production_batches b ON b.id=d.production_batch_id
     JOIN work_orders w ON w.id=b.work_order_id WHERE ${where.sql}`,
    where.values,
  );
  const [rows] = await db.query<DemandRow[]>(
    `${demandSelect} WHERE ${where.sql} ORDER BY w.id DESC,b.id DESC,d.id DESC LIMIT ? OFFSET ?`,
    [...where.values, pageSize, (page - 1) * pageSize],
  );
  return { items: rows.map(mapDemand), total: Number(count?.total ?? 0), page, pageSize };
}

export async function readDemandReferences(
  db: Db,
  ids: string[],
): Promise<ProcurementDemandCandidate[]> {
  if (!ids.length) return [];
  const [rows] = await db.query<DemandRow[]>(
    `${demandSelect} WHERE d.id IN (${ids.map(() => '?').join(',')}) ORDER BY d.id`,
    ids,
  );
  return rows.map(mapDemand);
}

export async function readDemandMaterialNames(db: Db, ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const [rows] = await db.query<(RowDataPacket & { id: number | string; material_name: string })[]>(
    `SELECT id,material_name FROM materials WHERE id IN (${ids.map(() => '?').join(',')})`,
    ids,
  );
  return new Map(rows.map((row) => [String(row.id), row.material_name]));
}

function mapDemand(row: DemandRow): ProcurementDemandCandidate {
  return {
    ...row,
    demandQuantity: String(row.demandQuantity),
    remainingDemandQuantity: String(row.remainingDemandQuantity),
  };
}

export async function readDemandWorkOrderPage(
  db: Db,
  query: ProcurementDemandWorkOrderQuery,
  variantIds: string[],
): Promise<PageResult<ProcurementDemandWorkOrder>> {
  const page = Math.max(1, query.page ?? 1),
    pageSize = Math.min(100, Math.max(1, query.pageSize ?? 10));
  if (!variantIds.length) return { items: [], total: 0, page, pageSize };
  const where = candidateFilter({});
  where.sql += ` AND d.material_variant_id IN (${variantIds.map(() => '?').join(',')})`;
  where.values.push(...variantIds);
  if (query.keyword?.trim()) {
    where.sql += ' AND w.work_order_no LIKE ?';
    where.values.push(`%${query.keyword.trim()}%`);
  }
  const from = `FROM production_item_demand d JOIN production_batches b ON b.id=d.production_batch_id
    JOIN work_orders w ON w.id=b.work_order_id WHERE ${where.sql}`;
  const [[count]] = await db.query<(RowDataPacket & { total: number })[]>(
    `SELECT COUNT(DISTINCT w.id) total ${from}`,
    where.values,
  );
  const [rows] = await db.query<(RowDataPacket & ProcurementDemandWorkOrder)[]>(
    `SELECT DISTINCT CAST(w.id AS CHAR) id,w.work_order_no workOrderNo ${from} ORDER BY w.work_order_no DESC LIMIT ? OFFSET ?`,
    [...where.values, pageSize, (page - 1) * pageSize],
  );
  return { items: rows, total: Number(count?.total ?? 0), page, pageSize };
}
