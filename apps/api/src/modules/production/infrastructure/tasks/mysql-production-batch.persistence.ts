import type { RowDataPacket } from 'mysql2/promise';
import type { ProductionBatchItem, ProductionTaskFinishMode } from '@company/contracts';
import { toDateOnlyString } from '../../../../common/time/date-time.js';
import { ProductionDomainError } from '../../domain/production.errors.js';
import type { Db } from '../shared/mysql-production-db.js';
import { nullableBeijingDateTime as date } from '../shared/mysql-production-mapping.js';
import { productionOutputInboundQuantitySql } from '../queries/production-output-inbound.query.js';

export type BatchRow = RowDataPacket & {
  id: number;
  work_order_id: number;
  work_order_no: string;
  order_type: ProductionBatchItem['orderType'];
  product_id: number;
  product_code_snapshot: string;
  product_name_snapshot: string;
  batch_no: string;
  route_id: number | null;
  route_code_snapshot: string | null;
  route_version_snapshot: string | null;
  planned_quantity: string;
  plan_start_date: Date | string | null;
  plan_end_date: Date | string | null;
  status: ProductionBatchItem['status'];
  started_by: number | null;
  start_reason: string | null;
  start_material_snapshot: unknown;
  finish_reason: string | null;
  finish_mode: ProductionTaskFinishMode | null;
  owner_id: number | null;
  completed_at: Date | null;
  started_at: Date | null;
  completed_by: number | null;
  cancel_reason: string | null;
  cancelled_by: number | null;
  cancelled_at: Date | null;
  remark: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
  available_quantity: string;
  confirmed_output_count: number;
  inbound_quantity: string;
};
export type BatchSummaryRow = BatchRow;
export type BatchOverviewRow = BatchRow;
const COLUMNS = `b.id,b.work_order_id,wo.work_order_no,wo.order_type,b.product_id,wo.product_code_snapshot,wo.product_name_snapshot,
 b.batch_no,b.route_id,b.route_code_snapshot,b.route_version_snapshot,b.planned_quantity,b.plan_start_date,b.plan_end_date,
 b.started_at,b.started_by,b.start_reason,b.start_material_snapshot,b.status,b.finish_reason,b.finish_mode,
 b.batch_owner_id owner_id,b.completed_at,b.completed_by,b.cancel_reason,b.cancelled_by,b.cancelled_at,b.remark,b.version,b.created_at,b.updated_at`;
const FROM = `FROM production_batches b JOIN work_orders wo ON wo.id=b.work_order_id`;
const OUTPUT = `CAST(COALESCE((SELECT SUM(o.quantity) FROM production_tracking_output o WHERE o.production_batch_id=b.id AND NOT EXISTS(SELECT 1 FROM production_tracking_output_cancellation x WHERE x.production_output_id=o.id)),0) AS CHAR) available_quantity,
 (SELECT COUNT(*) FROM production_tracking_output o WHERE o.production_batch_id=b.id AND NOT EXISTS(SELECT 1 FROM production_tracking_output_cancellation x WHERE x.production_output_id=o.id)) confirmed_output_count,
 ${productionOutputInboundQuantitySql('o.production_batch_id=b.id')} inbound_quantity`;
export const BATCH_SUMMARY_SELECT = `SELECT ${COLUMNS},${OUTPUT} ${FROM}`;
export const BATCH_OVERVIEW_SELECT = BATCH_SUMMARY_SELECT;
export const BATCH_SELECT = BATCH_SUMMARY_SELECT;
const BATCH_LOCK_SELECT = `SELECT ${COLUMNS},'0' available_quantity,0 confirmed_output_count,'0' inbound_quantity ${FROM}`;
export async function findBatch(db: Db, id: string, lock = false): Promise<BatchRow> {
  const [[row]] = await db.query<BatchRow[]>(
    `${lock ? BATCH_LOCK_SELECT : BATCH_SELECT} WHERE b.id=?${lock ? ' FOR UPDATE' : ''}`,
    [id],
  );
  if (!row) throw new ProductionDomainError('NOT_FOUND', '生产任务不存在');
  return row;
}
export const mapBatch = (row: BatchSummaryRow): ProductionBatchItem => ({
  id: String(row.id),
  workOrderId: String(row.work_order_id),
  workOrderNo: row.work_order_no,
  orderType: row.order_type,
  productId: String(row.product_id),
  productCode: row.product_code_snapshot,
  productName: row.product_name_snapshot,
  batchNo: row.batch_no,
  routeId: row.route_id === null ? null : String(row.route_id),
  routeCode: row.route_code_snapshot,
  routeVersion: row.route_version_snapshot,
  plannedQuantity: String(row.planned_quantity),
  planStartDate: toDateOnlyString(row.plan_start_date),
  planEndDate: toDateOnlyString(row.plan_end_date),
  startedAt: date(row.started_at),
  status: row.status,
  finalOutput: {
    availableQuantity: String(row.available_quantity),
    confirmedOutputCount: Number(row.confirmed_output_count),
    inboundQuantity: String(row.inbound_quantity),
    pendingInboundQuantity: String(Number(row.available_quantity) - Number(row.inbound_quantity)),
  },
  ownerId: row.owner_id === null ? null : String(row.owner_id),
  ownerName: null,
  completedAt: date(row.completed_at),
  version: row.version,
});
export const batchAudit = (row: BatchRow) => ({
  ownerId: row.owner_id === null ? null : String(row.owner_id),
  planStartDate: toDateOnlyString(row.plan_start_date),
  planEndDate: toDateOnlyString(row.plan_end_date),
  remark: row.remark,
  version: row.version,
});
