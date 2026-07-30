import { toBeijingISOString } from '../../../common/time/beijing-time.js';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { ProductionBatchItem, WorkOrderItem, WorkOrderStatus } from '@company/contracts';
import { ProductionDomainError } from '../domain/production.errors.js';

export type Db = Pool | PoolConnection;

export type WorkOrderRow = RowDataPacket & {
  id: number;
  work_order_no: string;
  product_id: number;
  product_code_snapshot: string;
  product_name_snapshot: string;
  unit_snapshot: string;
  planned_quantity: string;
  assigned_quantity: string;
  status: WorkOrderStatus;
  released_at: Date | null;
  customer_name: string | null;
  quality_level: string | null;
  work_order_owner_id: number | null;
  plan_start_date: string | null;
  plan_end_date: string | null;
  external_order_no: string | null;
  remark: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
};

export type BatchRow = RowDataPacket & {
  id: number;
  work_order_id: number;
  work_order_no: string;
  product_id: number;
  product_code_snapshot: string;
  product_name_snapshot: string;
  batch_no: string;
  route_id: number | null;
  route_code_snapshot: string | null;
  route_version_snapshot: string | null;
  planned_quantity: string;
  completed_quantity: string;
  qualified_quantity: string;
  plan_start_date: string | null;
  plan_end_date: string | null;
  status: ProductionBatchItem['status'];
  owner_id: number | null;
  completed_at: Date | null;
  started_at: Date | null;
  completed_by: number | null;
  remark: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
};

export type StepRow = RowDataPacket & {
  id: number;
  production_batch_id: number;
  route_step_id: number;
  step_order_snapshot: number;
  step_code_snapshot: string;
  step_name_snapshot: string;
  sop_file_id_snapshot: number | null;
  sop_file_name_snapshot: string | null;
  sop_version_no_snapshot: string | null;
  default_responsible_user_id_snapshot: number | null;
  actual_sop_file_id: number | null;
  actual_sop_file_name_snapshot: string | null;
  actual_sop_object_key_snapshot: string | null;
  actual_sop_version_no_snapshot: string | null;
  responsible_user_id: number | null;
  need_record_snapshot: number;
  need_inspection_snapshot: number;
  status: 'pending' | 'assigned' | 'doing' | 'completed' | 'abnormal';
  started_at: Date | null;
  completed_at: Date | null;
  output_quantity: string;
  qualified_quantity: string;
  abnormal_quantity: string;
  rework_quantity: string;
  unit_snapshot: string;
  remark: string | null;
  version: number;
};

export const WORK_ORDER_SELECT = `SELECT wo.id,wo.work_order_no,wo.product_id,wo.product_code_snapshot,wo.product_name_snapshot,wo.unit_snapshot,wo.planned_quantity,wo.customer_name,wo.quality_level,wo.work_order_owner_id,wo.plan_start_date,wo.plan_end_date,COALESCE((SELECT SUM(b.planned_quantity) FROM production_batches b WHERE b.work_order_id=wo.id AND b.status<>'cancelled'),0) assigned_quantity,wo.status,wo.released_at,wo.external_order_no,wo.remark,wo.version,wo.created_at,wo.updated_at FROM work_orders wo`;
export const BATCH_SELECT = `SELECT b.id,b.work_order_id,wo.work_order_no,b.product_id,wo.product_code_snapshot,wo.product_name_snapshot,b.batch_no,b.route_id,b.route_code_snapshot,b.route_version_snapshot,b.planned_quantity,b.completed_quantity,b.qualified_quantity,b.plan_start_date,b.plan_end_date,b.started_at,b.status,b.batch_owner_id owner_id,b.completed_at,b.completed_by,b.remark,b.version,b.created_at,b.updated_at FROM production_batches b JOIN work_orders wo ON wo.id=b.work_order_id`;
export const STEP_RECORD_SELECT = `SELECT sr.id,sr.production_batch_id,sr.route_step_id,sr.step_order_snapshot,sr.step_code_snapshot,sr.step_name_snapshot,sr.sop_file_id_snapshot,sr.sop_file_name_snapshot,sr.sop_version_no_snapshot,sr.default_responsible_user_id_snapshot,sr.actual_sop_file_id,sr.actual_sop_file_name_snapshot,sr.actual_sop_object_key_snapshot,sr.actual_sop_version_no_snapshot,sr.responsible_user_id,sr.need_record_snapshot,sr.need_inspection_snapshot,sr.status,sr.started_at,sr.completed_at,sr.output_quantity,sr.qualified_quantity,sr.abnormal_quantity,sr.rework_quantity,sr.unit_snapshot,sr.remark,sr.version FROM batch_step_records sr`;

export async function findWorkOrder(db: Db, id: string, lock = false): Promise<WorkOrderRow> {
  const [rows] = await db.query<WorkOrderRow[]>(
    `${WORK_ORDER_SELECT} WHERE wo.id=?${lock ? ' FOR UPDATE' : ''}`,
    [id],
  );
  if (!rows[0]) throw new ProductionDomainError('NOT_FOUND', '生产工单不存在');
  return rows[0];
}

export async function findBatch(db: Db, id: string, lock = false): Promise<BatchRow> {
  const [rows] = await db.query<BatchRow[]>(
    `${BATCH_SELECT} WHERE b.id=?${lock ? ' FOR UPDATE' : ''}`,
    [id],
  );
  if (!rows[0]) throw new ProductionDomainError('NOT_FOUND', '生产批次不存在');
  return rows[0];
}

export async function findStepRecord(
  db: Db,
  batchId: string,
  recordId: string,
  lock = false,
): Promise<StepRow> {
  const [rows] = await db.query<StepRow[]>(
    `${STEP_RECORD_SELECT} WHERE sr.id=? AND sr.production_batch_id=?${lock ? ' FOR UPDATE' : ''}`,
    [recordId, batchId],
  );
  if (!rows[0]) throw new ProductionDomainError('NOT_FOUND', '批次工序记录不存在');
  return rows[0];
}

export const mapWorkOrder = (row: WorkOrderRow): WorkOrderItem => ({
  id: String(row.id),
  workOrderNo: row.work_order_no,
  productId: String(row.product_id),
  productCode: row.product_code_snapshot,
  productName: row.product_name_snapshot,
  unit: row.unit_snapshot,
  plannedQuantity: row.planned_quantity,
  customerName: row.customer_name,
  qualityLevel: row.quality_level,
  workOrderOwnerId: row.work_order_owner_id === null ? null : String(row.work_order_owner_id),
  planStartDate: row.plan_start_date,
  planEndDate: row.plan_end_date,
  assignedQuantity: row.assigned_quantity,
  status: row.status,
  releasedAt: date(row.released_at),
  externalOrderNo: row.external_order_no,
  remark: row.remark,
  version: row.version,
  createdAt: toBeijingISOString(row.created_at),
  updatedAt: toBeijingISOString(row.updated_at),
});

export const mapBatch = (row: BatchRow): ProductionBatchItem => ({
  id: String(row.id),
  workOrderId: String(row.work_order_id),
  workOrderNo: row.work_order_no,
  productId: String(row.product_id),
  productCode: row.product_code_snapshot,
  productName: row.product_name_snapshot,
  batchNo: row.batch_no,
  routeId: row.route_id === null ? null : String(row.route_id),
  routeCode: row.route_code_snapshot,
  routeVersion: row.route_version_snapshot,
  plannedQuantity: row.planned_quantity,
  completedQuantity: row.completed_quantity,
  qualifiedQuantity: row.qualified_quantity,
  planStartDate: row.plan_start_date,
  planEndDate: row.plan_end_date,
  startedAt: date(row.started_at),
  status: row.status,
  ownerId: row.owner_id === null ? null : String(row.owner_id),
  ownerName: null,
  completedAt: date(row.completed_at),
  completedBy: row.completed_by === null ? null : String(row.completed_by),
  remark: row.remark,
  version: row.version,
  createdAt: toBeijingISOString(row.created_at),
  updatedAt: toBeijingISOString(row.updated_at),
});

export const mapStep = (row: StepRow) => ({
  id: String(row.id),
  productionBatchId: String(row.production_batch_id),
  routeStepId: String(row.route_step_id),
  stepOrder: row.step_order_snapshot,
  stepCode: row.step_code_snapshot,
  stepName: row.step_name_snapshot,
  defaultSopFileId: row.sop_file_id_snapshot === null ? null : String(row.sop_file_id_snapshot),
  defaultSopFileName: row.sop_file_name_snapshot,
  defaultSopVersionNo: row.sop_version_no_snapshot,
  actualSopFileId: row.actual_sop_file_id === null ? null : String(row.actual_sop_file_id),
  actualSopFileName: row.actual_sop_file_name_snapshot,
  actualSopVersionNo: row.actual_sop_version_no_snapshot,
  defaultResponsibleUserId:
    row.default_responsible_user_id_snapshot === null
      ? null
      : String(row.default_responsible_user_id_snapshot),
  defaultResponsibleUserName: null,
  responsibleUserId: row.responsible_user_id === null ? null : String(row.responsible_user_id),
  responsibleUserName: null,
  needRecord: Boolean(row.need_record_snapshot),
  needInspection: Boolean(row.need_inspection_snapshot),
  status: row.status,
  startedAt: date(row.started_at),
  completedAt: date(row.completed_at),
  outputQuantity: row.output_quantity,
  qualifiedQuantity: row.qualified_quantity,
  abnormalQuantity: row.abnormal_quantity,
  reworkQuantity: row.rework_quantity,
  unit: row.unit_snapshot,
  remark: row.remark,
  version: row.version,
});

export const workOrderAudit = (row: WorkOrderRow) => ({
  productId: String(row.product_id),
  productCode: row.product_code_snapshot,
  productName: row.product_name_snapshot,
  unit: row.unit_snapshot,
  plannedQuantity: row.planned_quantity,
  customerName: row.customer_name,
  qualityLevel: row.quality_level,
  workOrderOwnerId: row.work_order_owner_id === null ? null : String(row.work_order_owner_id),
  planStartDate: row.plan_start_date,
  planEndDate: row.plan_end_date,
  externalOrderNo: row.external_order_no,
  remark: row.remark,
  version: row.version,
});
export const batchAudit = (row: BatchRow) => ({
  ownerId: row.owner_id === null ? null : String(row.owner_id),
  planStartDate: row.plan_start_date,
  planEndDate: row.plan_end_date,
  remark: row.remark,
  version: row.version,
});
export const stepAudit = (row: StepRow) => ({
  actualSopFileId: row.actual_sop_file_id === null ? null : String(row.actual_sop_file_id),
  responsibleUserId: row.responsible_user_id === null ? null : String(row.responsible_user_id),
  version: row.version,
});
// TODO(decimal-precision): `need_number` 是不可变的 DECIMAL 事实，但这里为了兼容现有
// 数量语义仍用 JavaScript Number 相乘。确认是否允许保留浮点计算前，不得依赖此结果处理
// 十进制定点边界值；详见 docs/todo.md 的待整改项。
export const multiply = (left: string, right: string): string =>
  (Number(left) * Number(right)).toFixed(4);
const date = (value: Date | null): string | null =>
  value === null ? null : toBeijingISOString(value);
