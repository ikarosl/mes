import type { RowDataPacket } from 'mysql2/promise';
import type { ProductionBatchItem } from '@company/contracts';
import { toDateOnlyString } from '../../../../common/time/date-time.js';
import { ProductionDomainError } from '../../domain/production.errors.js';
import type { Db } from '../shared/mysql-production-db.js';
import { nullableBeijingDateTime as date } from '../shared/mysql-production-mapping.js';

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
  closeout_mode: ProductionBatchItem['closeoutMode'];
  closeout_version: number | null;
  current_revision_id: number | null;
  approved_output_revision_no: number | null;
  approved_available_quantity: string | null;
  approved_extra_quantity: string | null;
  approved_scrap_quantity: string | null;
  execution_completed_at: Date | null;
  execution_completed_by: number | null;
  started_by: number | null;
  start_reason: string | null;
  start_material_snapshot: unknown;
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
};

export type BatchSummaryRow = RowDataPacket &
  Pick<
    BatchRow,
    | 'id'
    | 'work_order_id'
    | 'work_order_no'
    | 'order_type'
    | 'product_id'
    | 'product_code_snapshot'
    | 'product_name_snapshot'
    | 'batch_no'
    | 'route_id'
    | 'route_code_snapshot'
    | 'route_version_snapshot'
    | 'planned_quantity'
    | 'plan_start_date'
    | 'plan_end_date'
    | 'started_at'
    | 'status'
    | 'closeout_mode'
    | 'closeout_version'
    | 'current_revision_id'
    | 'approved_output_revision_no'
    | 'approved_available_quantity'
    | 'approved_extra_quantity'
    | 'approved_scrap_quantity'
    | 'execution_completed_at'
    | 'owner_id'
    | 'completed_at'
    | 'version'
    | 'created_at'
  >;

export type BatchOverviewRow = BatchSummaryRow &
  Pick<
    BatchRow,
    | 'started_by'
    | 'execution_completed_by'
    | 'completed_by'
    | 'cancel_reason'
    | 'cancelled_by'
    | 'cancelled_at'
    | 'remark'
    | 'updated_at'
  >;

const BATCH_SUMMARY_COLUMNS = `b.id,b.work_order_id,wo.work_order_no,wo.order_type,b.product_id,wo.product_code_snapshot,wo.product_name_snapshot,b.batch_no,b.route_id,b.route_code_snapshot,b.route_version_snapshot,b.planned_quantity,b.plan_start_date,b.plan_end_date,b.started_at,b.status,
  c.closeout_mode,c.version closeout_version,c.current_revision_id,b.execution_completed_at,
  r.revision_no approved_output_revision_no,
  (round.baseline_planned_received+COALESCE((SELECT a.quantity FROM production_output_allocation a WHERE a.revision_id=r.id AND a.category='self_made'),0)) approved_available_quantity,
  (round.baseline_extra_received+COALESCE((SELECT a.quantity FROM production_output_allocation a WHERE a.revision_id=r.id AND a.category='production_extra'),0)) approved_extra_quantity,(r.existing_scrap_quantity+r.additional_scrap_quantity) approved_scrap_quantity,
  b.batch_owner_id owner_id,b.completed_at,b.version,b.created_at`;
const BATCH_OVERVIEW_COLUMNS = `b.started_by,b.execution_completed_by,b.completed_by,b.cancel_reason,b.cancelled_by,b.cancelled_at,b.remark,b.updated_at`;
const BATCH_DISPLAY_FROM = `FROM production_batches b JOIN work_orders wo ON wo.id=b.work_order_id LEFT JOIN production_batch_closeout c ON c.production_batch_id=b.id
  LEFT JOIN production_output_revision r ON r.id=c.current_revision_id AND r.closeout_id=c.id AND r.production_batch_id=b.id
  LEFT JOIN production_output_round round ON round.id=r.round_id`;
export const BATCH_SUMMARY_SELECT = `SELECT ${BATCH_SUMMARY_COLUMNS} ${BATCH_DISPLAY_FROM}`;
export const BATCH_OVERVIEW_SELECT = `SELECT ${BATCH_SUMMARY_COLUMNS},${BATCH_OVERVIEW_COLUMNS} ${BATCH_DISPLAY_FROM}`;
export const BATCH_SELECT = `SELECT ${BATCH_SUMMARY_COLUMNS},${BATCH_OVERVIEW_COLUMNS},b.start_reason,b.start_material_snapshot ${BATCH_DISPLAY_FROM}`;
const BATCH_LOCK_SELECT = `SELECT b.id,b.work_order_id,wo.work_order_no,wo.order_type,b.product_id,wo.product_code_snapshot,wo.product_name_snapshot,b.batch_no,b.route_id,b.route_code_snapshot,b.route_version_snapshot,b.planned_quantity,b.plan_start_date,b.plan_end_date,b.started_at,b.started_by,b.start_reason,b.start_material_snapshot,b.status,
  NULL closeout_mode,NULL closeout_version,NULL current_revision_id,b.execution_completed_at,b.execution_completed_by,
  NULL approved_output_revision_no,NULL approved_available_quantity,NULL approved_extra_quantity,NULL approved_scrap_quantity,
  b.batch_owner_id owner_id,b.completed_at,b.completed_by,b.cancel_reason,b.cancelled_by,b.cancelled_at,b.remark,b.version,b.created_at,b.updated_at FROM production_batches b JOIN work_orders wo ON wo.id=b.work_order_id`;

export async function findBatch(db: Db, id: string, lock = false): Promise<BatchRow> {
  const [rows] = await db.query<BatchRow[]>(
    `${lock ? BATCH_LOCK_SELECT : BATCH_SELECT} WHERE b.id=?${lock ? ' FOR UPDATE' : ''}`,
    [id],
  );
  if (!rows[0]) throw new ProductionDomainError('NOT_FOUND', '生产批次不存在');
  // 事务锁定读取只返回批次持久字段，避免派生子查询提前建立一致性快照。
  return rows[0];
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
  closeoutMode: row.closeout_mode,
  closeoutVersion: row.closeout_version,
  currentOutputRevisionId:
    row.current_revision_id === null ? null : String(row.current_revision_id),
  finalOutput:
    row.approved_output_revision_no === null
      ? null
      : {
          revisionNo: Number(row.approved_output_revision_no),
          availableQuantity: String(row.approved_available_quantity),
          extraQuantity: String(row.approved_extra_quantity),
          scrapQuantity: String(row.approved_scrap_quantity),
        },
  executionCompletedAt: date(row.execution_completed_at),
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
