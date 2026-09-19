import {
  workOrderAssignedQuantitySql,
  workOrderTerminatedPlanSql,
} from './mysql-work-order-allocation.sql.js';
import { toBeijingISOString, toDateOnlyString } from '../../../common/time/date-time.js';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import type {
  ProductionBatchItem,
  WorkOrderCloseType,
  WorkOrderFinalOutput,
  WorkOrderItem,
  WorkOrderStatus,
  WorkOrderType,
} from '@company/contracts';
import { ProductionDomainError } from '../domain/production.errors.js';
import { lastStepReportedQuantitySql } from './mysql-production-reporting.sql.js';
import { multiplyIntegerQuantities } from '../domain/integer-quantity.js';

/**
 * 把数据库驱动错误映射为稳定的模块错误。application 层不得识别 `ER_DUP_ENTRY` 等驱动错误码，
 * 兜底位置在 infrastructure 仓库：并发竞态下单据编号撞唯一约束时，映射为 409 语义的 CONFLICT。
 */
export const ensureNoDuplicate = (error: unknown, message: string): never => {
  if ((error as { code?: string })?.code === 'ER_DUP_ENTRY')
    throw new ProductionDomainError('CONFLICT', message);
  throw error;
};

export type Db = Pool | PoolConnection;

export type WorkOrderRow = RowDataPacket & {
  final_available_quantity: string;
  final_extra_quantity: string;
  final_scrap_quantity: string;
  finalized_batch_count: number;
  closing_batch_count: number;
  pending_available_quantity: string;
  pending_extra_quantity: string;
  id: number;
  work_order_no: string;
  order_type: WorkOrderType;
  previous_research_order_id: number | null;
  product_id: number;
  product_code_snapshot: string;
  product_name_snapshot: string;
  unit_snapshot: string;
  planned_quantity: string;
  assigned_quantity: string;
  terminated_planned_quantity: string;
  status: WorkOrderStatus;
  released_at: Date | null;
  cancel_reason: string | null;
  cancelled_by: number | null;
  cancelled_at: Date | null;
  close_type: WorkOrderCloseType | null;
  close_reason: string | null;
  closed_by: number | null;
  closed_at: Date | null;
  customer_name: string | null;
  quality_level: string | null;
  work_order_owner_id: number | null;
  plan_start_date: Date | string | null;
  plan_end_date: Date | string | null;
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
  last_step_reported_quantity: string;
  plan_start_date: Date | string | null;
  plan_end_date: Date | string | null;
  status: ProductionBatchItem['status'];
  closeout_mode: ProductionBatchItem['closeoutMode'];
  current_revision_id: number | null;
  approved_output_revision_no: number | null;
  approved_available_quantity: string | null;
  approved_extra_quantity: string | null;
  approved_scrap_quantity: string | null;
  execution_completed_at: Date | null;
  execution_completed_by: number | null;
  material_plan_version: number;
  short_batch_authorization_status: 'none' | 'valid' | 'stale' | 'consumed';
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
  need_inspection_snapshot: number;
  status: 'pending' | 'assigned' | 'doing' | 'completed' | 'terminated';
  started_at: Date | null;
  completed_at: Date | null;
  output_quantity: string;
  normal_quantity: string;
  abnormal_quantity: string;
  rework_quantity: string;
  unit_snapshot: string;
  remark: string | null;
  version: number;
};

export const WORK_ORDER_SELECT = `SELECT wo.id,wo.work_order_no,wo.order_type,wo.previous_research_order_id,wo.product_id,wo.product_code_snapshot,wo.product_name_snapshot,wo.unit_snapshot,wo.planned_quantity,wo.customer_name,wo.quality_level,wo.work_order_owner_id,wo.plan_start_date,wo.plan_end_date,${workOrderAssignedQuantitySql('wo.id')} assigned_quantity,${workOrderTerminatedPlanSql('wo.id')} terminated_planned_quantity,wo.status,wo.released_at,wo.cancel_reason,wo.cancelled_by,wo.cancelled_at,wo.close_type,wo.close_reason,wo.closed_by,wo.closed_at,wo.external_order_no,wo.remark,wo.version,wo.created_at,wo.updated_at,
  COALESCE((SELECT SUM(r.available_quantity) FROM production_batch_closeout c
    JOIN production_output_revision r ON r.id=c.current_revision_id AND r.closeout_id=c.id
    WHERE r.work_order_id=wo.id),0) final_available_quantity,
  COALESCE((SELECT SUM(r.extra_quantity) FROM production_batch_closeout c
    JOIN production_output_revision r ON r.id=c.current_revision_id AND r.closeout_id=c.id
    WHERE r.work_order_id=wo.id),0) final_extra_quantity,
  COALESCE((SELECT SUM(r.additional_scrap_quantity+r.existing_scrap_quantity) FROM production_batch_closeout c
    JOIN production_output_revision r ON r.id=c.current_revision_id AND r.closeout_id=c.id
    WHERE r.work_order_id=wo.id),0) final_scrap_quantity,
  (SELECT COUNT(*) FROM production_batch_closeout c
    JOIN production_output_revision r ON r.id=c.current_revision_id AND r.closeout_id=c.id
    WHERE r.work_order_id=wo.id) finalized_batch_count,
  (SELECT COUNT(*) FROM production_batches b WHERE b.work_order_id=wo.id AND b.status='closing') closing_batch_count,
  COALESCE((SELECT SUM(c.available_quantity) FROM production_batch_closeout c JOIN production_batches b ON b.id=c.production_batch_id
    WHERE b.work_order_id=wo.id AND b.status='closing'),0) pending_available_quantity,
  COALESCE((SELECT SUM(c.extra_quantity) FROM production_batch_closeout c JOIN production_batches b ON b.id=c.production_batch_id
    WHERE b.work_order_id=wo.id AND b.status='closing'),0) pending_extra_quantity
  FROM work_orders wo`;
export const BATCH_SELECT = `SELECT b.id,b.work_order_id,wo.work_order_no,b.product_id,wo.product_code_snapshot,wo.product_name_snapshot,b.batch_no,b.route_id,b.route_code_snapshot,b.route_version_snapshot,b.planned_quantity,${lastStepReportedQuantitySql('b.id')} last_step_reported_quantity,b.plan_start_date,b.plan_end_date,b.started_at,b.status,b.material_plan_version,
  c.closeout_mode,c.current_revision_id,b.execution_completed_at,b.execution_completed_by,
  r.revision_no approved_output_revision_no,r.available_quantity approved_available_quantity,
  r.extra_quantity approved_extra_quantity,(r.existing_scrap_quantity+r.additional_scrap_quantity) approved_scrap_quantity,
  CASE
    WHEN EXISTS (SELECT 1 FROM production_short_batch_authorization authorization WHERE authorization.production_batch_id=b.id AND authorization.status='active' AND authorization.material_plan_version=b.material_plan_version) THEN 'valid'
    WHEN EXISTS (SELECT 1 FROM production_short_batch_authorization authorization WHERE authorization.production_batch_id=b.id AND authorization.status='active') THEN 'stale'
    WHEN EXISTS (SELECT 1 FROM production_short_batch_authorization authorization WHERE authorization.production_batch_id=b.id AND authorization.status='consumed') THEN 'consumed'
    ELSE 'none'
  END short_batch_authorization_status,
  b.batch_owner_id owner_id,b.completed_at,b.completed_by,b.cancel_reason,b.cancelled_by,b.cancelled_at,b.remark,b.version,b.created_at,b.updated_at FROM production_batches b JOIN work_orders wo ON wo.id=b.work_order_id LEFT JOIN production_batch_closeout c ON c.production_batch_id=b.id
  LEFT JOIN production_output_revision r ON r.id=c.current_revision_id AND r.closeout_id=c.id AND r.production_batch_id=b.id`;
const BATCH_LOCK_SELECT = `SELECT b.id,b.work_order_id,wo.work_order_no,b.product_id,wo.product_code_snapshot,wo.product_name_snapshot,b.batch_no,b.route_id,b.route_code_snapshot,b.route_version_snapshot,b.planned_quantity,0 last_step_reported_quantity,b.plan_start_date,b.plan_end_date,b.started_at,b.status,b.material_plan_version,
  NULL closeout_mode,NULL current_revision_id,b.execution_completed_at,b.execution_completed_by,
  NULL approved_output_revision_no,NULL approved_available_quantity,NULL approved_extra_quantity,NULL approved_scrap_quantity,
  'none' short_batch_authorization_status,
  b.batch_owner_id owner_id,b.completed_at,b.completed_by,b.cancel_reason,b.cancelled_by,b.cancelled_at,b.remark,b.version,b.created_at,b.updated_at FROM production_batches b JOIN work_orders wo ON wo.id=b.work_order_id`;
export const STEP_RECORD_SELECT = `SELECT sr.id,sr.production_batch_id,sr.route_step_id,sr.step_order_snapshot,sr.step_code_snapshot,sr.step_name_snapshot,sr.sop_file_id_snapshot,sr.sop_file_name_snapshot,sr.sop_version_no_snapshot,sr.default_responsible_user_id_snapshot,sr.actual_sop_file_id,sr.actual_sop_file_name_snapshot,sr.actual_sop_object_key_snapshot,sr.actual_sop_version_no_snapshot,sr.responsible_user_id,sr.need_inspection_snapshot,sr.status,sr.started_at,sr.completed_at,COALESCE(report_summary.reported_quantity,0) output_quantity,COALESCE(report_summary.normal_quantity,0) normal_quantity,COALESCE(report_summary.abnormal_quantity,0) abnormal_quantity,0 rework_quantity,sr.unit_snapshot,sr.remark,sr.version FROM batch_step_records sr LEFT JOIN (SELECT batch_step_record_id,SUM(CASE WHEN report_type='normal' THEN reported_quantity ELSE -reported_quantity END) reported_quantity,SUM(CASE WHEN report_type='normal' THEN normal_quantity ELSE -normal_quantity END) normal_quantity,SUM(CASE WHEN report_type='normal' THEN abnormal_quantity ELSE -abnormal_quantity END) abnormal_quantity FROM batch_step_reports GROUP BY batch_step_record_id) report_summary ON report_summary.batch_step_record_id=sr.id`;

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
    `${lock ? BATCH_LOCK_SELECT : BATCH_SELECT} WHERE b.id=?${lock ? ' FOR UPDATE' : ''}`,
    [id],
  );
  if (!rows[0]) throw new ProductionDomainError('NOT_FOUND', '生产批次不存在');
  // 事务锁定读取只返回批次持久字段，避免派生授权子查询提前建立一致性快照。
  // 需要作短批判定的写事务必须调用专用授权校验并锁定授权事实，不能依赖该展示字段。
  // last_step_reported_quantity 的锁定读取占位值不参与业务判断；写事务另行锁读报工事实。
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

export const mapWorkOrderFinalOutput = (row: WorkOrderRow): WorkOrderFinalOutput => ({
  availableQuantity: String(row.final_available_quantity ?? '0'),
  extraQuantity: String(row.final_extra_quantity ?? '0'),
  scrapQuantity: String(row.final_scrap_quantity ?? '0'),
  totalQuantity: String(
    Number(row.final_available_quantity ?? 0) +
      Number(row.final_extra_quantity ?? 0) +
      Number(row.final_scrap_quantity ?? 0),
  ),
  plannedShortfallQuantity: String(
    Number(row.planned_quantity) - Number(row.final_available_quantity ?? 0),
  ),
  finalizedBatchCount: Number(row.finalized_batch_count ?? 0),
  closingBatchCount: Number(row.closing_batch_count ?? 0),
  pendingAvailableQuantity: String(row.pending_available_quantity ?? '0'),
  pendingExtraQuantity: String(row.pending_extra_quantity ?? '0'),
});

export const mapWorkOrder = (row: WorkOrderRow): WorkOrderItem => ({
  finalOutput: mapWorkOrderFinalOutput(row),
  id: String(row.id),
  workOrderNo: row.work_order_no,
  orderType: row.order_type,
  previousResearchOrderId:
    row.previous_research_order_id === null ? null : String(row.previous_research_order_id),
  productId: String(row.product_id),
  productCode: row.product_code_snapshot,
  productName: row.product_name_snapshot,
  unit: row.unit_snapshot,
  plannedQuantity: String(row.planned_quantity),
  customerName: row.customer_name,
  qualityLevel: row.quality_level,
  workOrderOwnerId: row.work_order_owner_id === null ? null : String(row.work_order_owner_id),
  planStartDate: toDateOnlyString(row.plan_start_date),
  planEndDate: toDateOnlyString(row.plan_end_date),
  assignedQuantity: String(row.assigned_quantity),
  terminatedPlannedQuantity: String(row.terminated_planned_quantity),
  status: row.status,
  releasedAt: date(row.released_at),
  cancelReason: row.cancel_reason,
  cancelledBy: row.cancelled_by === null ? null : String(row.cancelled_by),
  cancelledByName: null,
  cancelledAt: date(row.cancelled_at),
  closeType: row.close_type,
  closeReason: row.close_reason,
  closedBy: row.closed_by === null ? null : String(row.closed_by),
  closedByName: null,
  closedAt: date(row.closed_at),
  externalOrderNo: row.external_order_no,
  remark: row.remark,
  version: row.version,
  createdAt: toBeijingISOString(row.created_at),
  updatedAt: toBeijingISOString(row.updated_at),
});

export const mapBatch = (
  row: BatchRow,
  authorizationAction: ProductionBatchItem['shortBatchAuthorizationAction'],
): ProductionBatchItem => ({
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
  plannedQuantity: String(row.planned_quantity),
  lastStepReportedQuantity: String(row.last_step_reported_quantity),
  planStartDate: toDateOnlyString(row.plan_start_date),
  planEndDate: toDateOnlyString(row.plan_end_date),
  startedAt: date(row.started_at),
  status: row.status,
  closeoutMode: row.closeout_mode,
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
  executionCompletedBy:
    row.execution_completed_by === null ? null : String(row.execution_completed_by),
  materialPlanVersion: row.material_plan_version,
  shortBatchAuthorizationStatus: row.short_batch_authorization_status,
  shortBatchAuthorizationAction: authorizationAction,
  ownerId: row.owner_id === null ? null : String(row.owner_id),
  ownerName: null,
  completedAt: date(row.completed_at),
  completedBy: row.completed_by === null ? null : String(row.completed_by),
  ...(row.status === 'cancelled'
    ? {
        cancelReason: row.cancel_reason,
        cancelledBy: row.cancelled_by === null ? null : String(row.cancelled_by),
        cancelledByName: null,
        cancelledAt: date(row.cancelled_at),
      }
    : {}),
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
  needInspection: Boolean(row.need_inspection_snapshot),
  status: row.status,
  startedAt: date(row.started_at),
  completedAt: date(row.completed_at),
  outputQuantity: String(row.output_quantity),
  normalQuantity: String(row.normal_quantity),
  abnormalQuantity: String(row.abnormal_quantity),
  reworkQuantity: String(row.rework_quantity),
  unit: row.unit_snapshot,
  remark: row.remark,
  version: row.version,
});

export const workOrderAudit = (row: WorkOrderRow) => ({
  productId: String(row.product_id),
  productCode: row.product_code_snapshot,
  productName: row.product_name_snapshot,
  unit: row.unit_snapshot,
  plannedQuantity: String(row.planned_quantity),
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
export const multiply = (left: string, right: string): string => {
  try {
    return multiplyIntegerQuantities(left, right);
  } catch {
    throw new ProductionDomainError(
      'INVALID_INPUT',
      'BOM 单位用量与批次计划量必须为整数，且需求数量不能超过 99999999',
    );
  }
};
/** 数据库驱动对 DATE/DATETIME 列返回 Date 实例（类型曾误标 string），统一转北京 ISO 字符串。 */
const date = (value: Date | string | null): string | null => {
  if (value === null) return null;
  return typeof value === 'string' ? value : toBeijingISOString(value);
};
