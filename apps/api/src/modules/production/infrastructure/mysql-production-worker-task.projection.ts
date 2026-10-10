import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import type {
  BatchStepStatus,
  PageQuery,
  PageResult,
  ProductionBatchStatus,
  ProductionWorkerTaskItem,
  ProductionStepQuotaDistribution,
} from '@company/contracts';
import { toBeijingISOString } from '../../../common/time/date-time.js';
import {
  calculateRouteStepQuantities,
  type RouteStepQuantity,
} from '../domain/production-route-quantity.policy.js';
import { evaluateProductionStepActionAvailability } from '../domain/production-step-actions.policy.js';
import { reportWriteEligibility } from '../domain/production-reporting.policy.js';
import { selectRouteSupplementSources } from './mysql-production-supplement-activation.js';
import { mapQuantityProjection, groupRowsBy } from './mysql-production-reporting.projection.js';
import {
  REPORT_SUMMARY_COLUMNS,
  selectProjectionStepsByBatchIds,
  toRouteQuantityStep,
} from './mysql-production-reporting.persistence.js';
import { readProductionSnapshot } from './mysql-production-read-snapshot.js';
import {
  calculateStepQuotaDistributions,
  selectStepQuotaFacts,
} from './mysql-production-quota.read.js';

type WorkerTaskRow = RowDataPacket & {
  step_record_id: number;
  production_batch_id: number;
  batch_no: string;
  batch_status: ProductionBatchStatus;
  pending_approval_id: number | null;
  work_order_id: number;
  work_order_no: string;
  product_id: number;
  product_code: string;
  product_name: string;
  planned_quantity: string;
  step_order: number;
  step_code: string;
  step_name: string;
  sop_file_name: string | null;
  sop_version_no: string | null;
  step_status: BatchStepStatus;
  unit_snapshot: string;
  effective_reported: string;
  effective_direct_reported: string;
  effective_direct_normal: string;
  effective_direct_abnormal: string;
  effective_normal: string;
  effective_abnormal: string;
  started_at: Date | null;
  completed_at: Date | null;
  version: number;
};
const REPORT_SUMMARY = `SELECT r.batch_step_record_id,${REPORT_SUMMARY_COLUMNS} FROM batch_step_reports r GROUP BY r.batch_step_record_id`;
const WORKER_FROM = `FROM batch_step_records current JOIN production_batches b ON b.id=current.production_batch_id
  JOIN work_orders wo ON wo.id=b.work_order_id`;
const WORKER_WHERE = `b.status<>'cancelled' AND current.responsible_user_id=? AND current.status IN ('assigned','doing','completed','terminated')`;
const WORKER_TASK_SELECT = `WITH report_summary AS (${REPORT_SUMMARY})
 SELECT current.id step_record_id,current.production_batch_id,b.batch_no,b.status batch_status,c.pending_approval_id,
  wo.id work_order_id,wo.work_order_no,b.product_id,wo.product_code_snapshot product_code,wo.product_name_snapshot product_name,
  b.planned_quantity,current.step_order_snapshot step_order,current.step_code_snapshot step_code,current.step_name_snapshot step_name,
  current.status step_status,COALESCE(current.actual_sop_file_name_snapshot,current.sop_file_name_snapshot) sop_file_name,
  COALESCE(current.actual_sop_version_no_snapshot,current.sop_version_no_snapshot) sop_version_no,current.unit_snapshot,
  COALESCE(current_reports.effective_reported,0) effective_reported,
  COALESCE(current_reports.effective_direct_reported,0) effective_direct_reported,
  COALESCE(current_reports.effective_direct_normal,0) effective_direct_normal,
  COALESCE(current_reports.effective_direct_abnormal,0) effective_direct_abnormal,
  COALESCE(current_reports.effective_normal,0) effective_normal,COALESCE(current_reports.effective_abnormal,0) effective_abnormal,
  current.started_at,current.completed_at,current.version
 ${WORKER_FROM} LEFT JOIN production_batch_closeout c ON c.production_batch_id=b.id
 LEFT JOIN report_summary current_reports ON current_reports.batch_step_record_id=current.id
 WHERE ${WORKER_WHERE}
 ORDER BY CASE WHEN b.status='doing' THEN 0 WHEN b.status IN ('material_outbound','material_partially_outbound') THEN 1 ELSE 2 END,
  CASE current.status WHEN 'doing' THEN 0 WHEN 'assigned' THEN 1 WHEN 'completed' THEN 2 ELSE 3 END,
  b.id DESC,current.step_order_snapshot,current.id LIMIT ? OFFSET ?`;

/** 当前本人负责的工序含已结案历史；记录明细由独立分页接口读取。 */
export async function selectWorkerTasks(
  pool: Pool,
  actorId: string,
  query: PageQuery,
): Promise<PageResult<ProductionWorkerTaskItem>> {
  return readProductionSnapshot(pool, (db) => selectWorkerTaskPage(db, actorId, query));
}

async function selectWorkerTaskPage(
  db: PoolConnection,
  actorId: string,
  query: PageQuery,
): Promise<PageResult<ProductionWorkerTaskItem>> {
  const page = query.page ?? 1,
    pageSize = query.pageSize ?? 10;
  const [[count]] = await db.query<(RowDataPacket & { total: number })[]>(
    `SELECT COUNT(*) total ${WORKER_FROM} WHERE ${WORKER_WHERE}`,
    [actorId],
  );
  const [rows] = await db.query<WorkerTaskRow[]>(WORKER_TASK_SELECT, [
    actorId,
    pageSize,
    (page - 1) * pageSize,
  ]);
  const batchIds = [...new Set(rows.map((row) => String(row.production_batch_id)))];
  if (!batchIds.length) return { items: [], total: Number(count?.total ?? 0), page, pageSize };
  const supplementsByBatch = await selectRouteSupplementSources(db, batchIds);
  const routeSteps = await selectProjectionStepsByBatchIds(db, batchIds);
  const stepsByBatch = groupRowsBy(routeSteps, (step) => String(step.production_batch_id));
  const quantitiesByStep = new Map<string, RouteStepQuantity>(),
    firstStepIds = new Set<string>();
  for (const batchId of batchIds) {
    const steps = stepsByBatch.get(batchId) ?? [];
    if (steps[0]) firstStepIds.add(String(steps[0].id));
    const planned = rows.find(
      (row) => String(row.production_batch_id) === batchId,
    )!.planned_quantity;
    for (const [id, quantity] of calculateRouteStepQuantities(
      planned,
      steps.map(toRouteQuantityStep),
      supplementsByBatch.get(batchId) ?? [],
    ))
      quantitiesByStep.set(id, quantity);
  }
  // 事实范围只使用本次分页、当前本人负责的工序身份；其它路线仅参与原数量差投影。
  const pageStepIds = new Set(rows.map((row) => String(row.step_record_id)));
  const quotaFacts = await selectStepQuotaFacts(db, [...pageStepIds]);
  const quotaDistributions = calculateStepQuotaDistributions(
    routeSteps.filter((step) => pageStepIds.has(String(step.id))),
    quantitiesByStep,
    quotaFacts,
  );
  return {
    items: rows.map((row) =>
      mapWorkerTask(
        row,
        quantitiesByStep.get(String(row.step_record_id))!,
        firstStepIds.has(String(row.step_record_id)),
        actorId,
        quotaDistributions.get(String(row.step_record_id))!,
      ),
    ),
    total: Number(count?.total ?? 0),
    page,
    pageSize,
  };
}

function mapWorkerTask(
  row: WorkerTaskRow,
  quantity: RouteStepQuantity,
  isFirst: boolean,
  actorId: string,
  quotaDistribution: ProductionStepQuotaDistribution,
): ProductionWorkerTaskItem {
  const pendingApprovalId =
    row.pending_approval_id === null ? null : String(row.pending_approval_id);
  const actions = evaluateProductionStepActionAvailability({
    batchStatus: row.batch_status,
    stepStatus: row.step_status,
    hasStarted: row.started_at !== null,
    hasResponsibleUser: true,
    isFirstStep: isFirst,
    pendingApprovalId,
  });
  const reporting = reportWriteEligibility(
    row.batch_status,
    pendingApprovalId,
    row.step_status,
    actorId,
    { actorId, canManageExecution: false, canReport: true, canReadAllReports: false },
    quantity.availableReportQuantity,
  );
  return {
    stepRecordId: String(row.step_record_id),
    productionBatchId: String(row.production_batch_id),
    batchStatus: row.batch_status,
    batchNo: row.batch_no,
    workOrderId: String(row.work_order_id),
    workOrderNo: row.work_order_no,
    productId: String(row.product_id),
    productCode: row.product_code,
    productName: row.product_name,
    stepOrder: row.step_order,
    hasPreviousStep: !isFirst,
    stepCode: row.step_code,
    stepName: row.step_name,
    sopFileName: row.sop_file_name,
    sopVersionNo: row.sop_version_no,
    status: row.step_status,
    unit: row.unit_snapshot,
    plannedQuantity: String(row.planned_quantity),
    baseNormalQuantity: String(row.planned_quantity),
    ...mapQuantityProjection(row, quantity),
    activatedSupplementInputQuantity: quantity.activatedSupplementInputQuantity,
    activatedSupplementTargetQuantity: quantity.activatedSupplementTargetQuantity,
    pendingSupplementInputQuantity: quantity.pendingSupplementInputQuantity,
    quotaDistribution,
    startedAt: row.started_at ? toBeijingISOString(row.started_at) : null,
    completedAt: row.completed_at ? toBeijingISOString(row.completed_at) : null,
    version: row.version,
    canStart: actions.canStart,
    startBlockedReason: actions.startBlockedReason,
    canComplete: actions.canComplete,
    completeBlockedReason: actions.completeBlockedReason,
    canReopen: actions.canReopen,
    reopenBlockedReason: actions.reopenBlockedReason,
    canReport: reporting.canReport,
    reportBlockedReason: reporting.reportBlockedReason,
    canCorrectReport: reporting.canCorrectReport,
    correctionBlockedReason: reporting.correctionBlockedReason,
  };
}
