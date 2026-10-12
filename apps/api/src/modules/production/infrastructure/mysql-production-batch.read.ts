import type {
  ProductionBatchDetail,
  ProductionBatchStartRecord,
  ProductionBatchStepRecords,
  ProductionBatchStepRecordsHeader,
} from '@company/contracts';
import type { RowDataPacket } from 'mysql2/promise';
import { toBeijingISOString } from '../../../common/time/date-time.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { evaluateAssignmentAvailability } from '../domain/production-execution.policy.js';
import { calculateRouteStepQuantities } from '../domain/production-route-quantity.policy.js';
import {
  pendingReportingApproval,
  PROJECTION_STEP_SELECT,
  toRouteQuantityStep,
} from './mysql-production-reporting.persistence.js';
import type { ProjectionStepRow } from './mysql-production-reporting.projection.js';
import { selectRouteSupplementSources } from './mysql-production-supplement-activation.js';
import {
  BATCH_OVERVIEW_SELECT,
  mapBatch,
  mapStep,
  readStartMaterialSnapshot,
  STEP_RECORD_SELECT,
  type BatchOverviewRow,
  type Db,
  type StepRow,
} from './mysql-production.shared.js';

type BatchStepHeaderRow = RowDataPacket & {
  id: number;
  batch_no: string;
  work_order_no: string;
  order_type: ProductionBatchStepRecordsHeader['orderType'];
  product_code_snapshot: string;
  product_name_snapshot: string;
  planned_quantity: string;
  status: ProductionBatchStepRecordsHeader['status'];
  route_code_snapshot: string | null;
  route_version_snapshot: string | null;
};

type BatchStartRecordRow = RowDataPacket & {
  id: number;
  started_at: Date | null;
  started_by: number | null;
  start_reason: string | null;
  start_material_snapshot: unknown;
};

export async function selectBatchOverview(db: Db, id: string): Promise<ProductionBatchDetail> {
  const [[row]] = await db.query<BatchOverviewRow[]>(`${BATCH_OVERVIEW_SELECT} WHERE b.id=?`, [id]);
  if (!row) throw new ProductionDomainError('NOT_FOUND', '生产批次不存在');
  return {
    ...mapBatch(row),
    startedById: row.started_by === null ? null : String(row.started_by),
    startedByName: null,
    executionCompletedBy:
      row.execution_completed_by === null ? null : String(row.execution_completed_by),
    completedBy: row.completed_by === null ? null : String(row.completed_by),
    cancelReason: row.cancel_reason,
    cancelledBy: row.cancelled_by === null ? null : String(row.cancelled_by),
    cancelledByName: null,
    cancelledAt: row.cancelled_at === null ? null : toBeijingISOString(row.cancelled_at),
    remark: row.remark,
    createdAt: toBeijingISOString(row.created_at),
    updatedAt: toBeijingISOString(row.updated_at),
  };
}

export async function selectBatchStepRecords(
  db: Db,
  id: string,
): Promise<ProductionBatchStepRecords> {
  const [[batch]] = await db.query<BatchStepHeaderRow[]>(
    `SELECT b.id,b.batch_no,wo.work_order_no,wo.order_type,wo.product_code_snapshot,
      wo.product_name_snapshot,b.planned_quantity,b.status,b.route_code_snapshot,b.route_version_snapshot
     FROM production_batches b JOIN work_orders wo ON wo.id=b.work_order_id WHERE b.id=?`,
    [id],
  );
  if (!batch) throw new ProductionDomainError('NOT_FOUND', '生产批次不存在');
  const header: ProductionBatchStepRecordsHeader = {
    id: String(batch.id),
    batchNo: batch.batch_no,
    workOrderNo: batch.work_order_no,
    orderType: batch.order_type,
    productCode: batch.product_code_snapshot,
    productName: batch.product_name_snapshot,
    plannedQuantity: String(batch.planned_quantity),
    status: batch.status,
    routeCode: batch.route_code_snapshot,
    routeVersion: batch.route_version_snapshot,
  };
  if (batch.order_type === 'research') return { batch: header, stepRecords: [] };

  const [steps] = await db.query<StepRow[]>(
    `${STEP_RECORD_SELECT} WHERE sr.production_batch_id=? ORDER BY sr.step_order_snapshot,sr.id`,
    [id],
  );
  const [projections] = await db.query<ProjectionStepRow[]>(PROJECTION_STEP_SELECT, [id]);
  const projectionById = new Map(projections.map((step) => [String(step.id), step]));
  const supplements = (await selectRouteSupplementSources(db, [id])).get(id) ?? [];
  const quantities = calculateRouteStepQuantities(
    batch.planned_quantity,
    projections.map(toRouteQuantityStep),
    supplements,
  );
  const pendingApprovalId = await pendingReportingApproval(db, id);
  return {
    batch: header,
    stepRecords: steps.map((step) => {
      const projection = projectionById.get(String(step.id));
      const quantity = quantities.get(String(step.id));
      if (!projection || !quantity) throw new Error('任务工序数量投影缺失');
      const executionEditBlockedReason =
        pendingApprovalId !== null
          ? '结案或产出更正在审批，工序参数被冻结'
          : ['cancelled', 'completed', 'terminated', 'closing'].includes(batch.status)
            ? '任务已结束执行，不能调整实际 SOP'
            : step.status !== 'pending' && step.status !== 'assigned'
              ? '工序开始后不能调整实际 SOP'
              : null;
      return {
        ...mapStep(step),
        upperLimitQuantity: quantity.upperLimitQuantity,
        effectiveDirectReportedQuantity: String(projection.effective_direct_reported),
        effectiveDirectNormalQuantity: String(projection.effective_direct_normal),
        effectiveDirectAbnormalQuantity: String(projection.effective_direct_abnormal),
        ...evaluateAssignmentAvailability({
          batchStatus: batch.status,
          stepStatus: step.status,
          hasReportHistory: Number(projection.report_count) > 0,
          hasStarted: step.started_at !== null,
          pendingApprovalId,
        }),
        canEditExecution: executionEditBlockedReason === null,
        executionEditBlockedReason,
      };
    }),
  };
}

export async function selectBatchStartRecord(
  db: Db,
  id: string,
): Promise<ProductionBatchStartRecord | null> {
  const [[row]] = await db.query<BatchStartRecordRow[]>(
    `SELECT id,started_at,started_by,start_reason,start_material_snapshot
     FROM production_batches WHERE id=?`,
    [id],
  );
  if (!row) throw new ProductionDomainError('NOT_FOUND', '生产批次不存在');
  if (row.started_at === null) return null;
  const snapshot = readStartMaterialSnapshot(row.start_material_snapshot);
  if (row.started_by === null || snapshot === null) throw new Error('任务开工记录存储不完整');
  return {
    productionBatchId: String(row.id),
    startedAt: toBeijingISOString(row.started_at),
    startedById: String(row.started_by),
    startedByName: null,
    startReason: row.start_reason,
    startMaterialSnapshot: snapshot,
  };
}
