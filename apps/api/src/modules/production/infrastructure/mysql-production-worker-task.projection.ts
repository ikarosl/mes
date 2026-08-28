import type { Pool, RowDataPacket } from 'mysql2/promise';
import type {
  BatchStepStatus,
  ProductionBatchStatus,
  ProductionWorkerTaskItem,
} from '@company/contracts';
import { toBeijingISOString } from '../../../common/time/date-time.js';
import {
  calculateRouteStepQuantities,
  type RouteQuantityStep,
  type RouteStepQuantity,
} from '../domain/production-route-quantity.policy.js';
import { integerQuantity } from '../domain/integer-quantity.js';
import { selectRouteSupplementSources } from './mysql-production-supplement-activation.js';

type WorkerTaskRow = RowDataPacket & {
  step_record_id: number;
  production_batch_id: number;
  batch_no: string;
  batch_status: ProductionBatchStatus;
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
  need_record: number;
  unit_snapshot: string;
  effective_reported: string;
  effective_direct_reported: string;
  effective_normal: string;
  effective_abnormal: string;
  started_at: Date | null;
  version: number;
  short_batch_startable: number;
};

const REPORT_SUMMARY = `SELECT batch_step_record_id,
  SUM(CASE WHEN report_type='normal' THEN reported_quantity ELSE -reported_quantity END) effective_reported,
  SUM(CASE WHEN NOT EXISTS (
    SELECT 1 FROM rework_records direct_rework WHERE direct_rework.completed_report_id=batch_step_reports.id
  ) THEN CASE WHEN report_type='normal' THEN reported_quantity ELSE -reported_quantity END ELSE 0 END) effective_direct_reported,
  SUM(CASE WHEN report_type='normal' THEN normal_quantity ELSE -normal_quantity END) effective_normal,
  SUM(CASE WHEN report_type='normal' THEN abnormal_quantity ELSE -abnormal_quantity END) effective_abnormal
  FROM batch_step_reports GROUP BY batch_step_record_id`;

const WORKER_TASK_SELECT = `WITH report_summary AS (${REPORT_SUMMARY})
SELECT current.id step_record_id,current.production_batch_id,b.batch_no,b.status batch_status,
  wo.id work_order_id,wo.work_order_no,b.product_id,wo.product_code_snapshot product_code,
  wo.product_name_snapshot product_name,b.planned_quantity,current.step_order_snapshot step_order,
  current.step_code_snapshot step_code,current.step_name_snapshot step_name,current.status step_status,
  COALESCE(current.actual_sop_file_name_snapshot,current.sop_file_name_snapshot) sop_file_name,
  COALESCE(current.actual_sop_version_no_snapshot,current.sop_version_no_snapshot) sop_version_no,
  current.need_record_snapshot need_record,current.unit_snapshot,
  COALESCE(current_reports.effective_reported,0) effective_reported,
  COALESCE(current_reports.effective_direct_reported,0) effective_direct_reported,
  COALESCE(current_reports.effective_normal,0) effective_normal,
  COALESCE(current_reports.effective_abnormal,0) effective_abnormal,current.started_at,current.version,
  CASE WHEN b.status='material_partially_outbound'
    AND EXISTS (
      SELECT 1 FROM production_short_batch_authorization authorization
      WHERE authorization.production_batch_id=b.id
        AND authorization.material_plan_version=b.material_plan_version
        AND authorization.status='active'
        AND EXISTS (SELECT 1 FROM outbound_order outbound WHERE outbound.production_batch_id=b.id AND outbound.status='completed')
        AND NOT EXISTS (
          SELECT 1 FROM production_item_demand demand
          LEFT JOIN production_short_batch_authorization_detail detail
            ON detail.authorization_id=authorization.id AND detail.demand_id=demand.id
          WHERE demand.production_batch_id=b.id AND demand.business_status='active'
            AND (detail.id IS NULL OR demand.remaining_number>detail.authorized_remaining_quantity)
        )
    ) THEN 1 ELSE 0 END short_batch_startable
FROM batch_step_records current
JOIN production_batches b ON b.id=current.production_batch_id
JOIN work_orders wo ON wo.id=b.work_order_id
LEFT JOIN report_summary current_reports ON current_reports.batch_step_record_id=current.id
WHERE current.responsible_user_id=? AND current.status IN ('assigned','doing','completed')
ORDER BY CASE current.status WHEN 'doing' THEN 0 WHEN 'assigned' THEN 1 ELSE 2 END,b.id,current.step_order_snapshot`;

type QuantityStepRow = RowDataPacket & {
  id: number;
  production_batch_id: number;
  step_order_snapshot: number;
  need_record_snapshot: number;
  status: BatchStepStatus;
  effective_direct_reported: string;
  effective_normal: string;
};

const QUANTITY_STEP_SELECT = `WITH report_summary AS (${REPORT_SUMMARY})
SELECT step_record.id,step_record.production_batch_id,step_record.step_order_snapshot,
  step_record.need_record_snapshot,step_record.status,
  COALESCE(report_summary.effective_direct_reported,0) effective_direct_reported,
  COALESCE(report_summary.effective_normal,0) effective_normal
FROM batch_step_records step_record
LEFT JOIN report_summary ON report_summary.batch_step_record_id=step_record.id
WHERE step_record.production_batch_id IN`;

export const selectWorkerTasks = async (
  pool: Pool,
  actorId: string,
): Promise<ProductionWorkerTaskItem[]> => {
  const [rows] = await pool.query<WorkerTaskRow[]>(WORKER_TASK_SELECT, [actorId]);
  const batchIds = [...new Set(rows.map((row) => String(row.production_batch_id)))];
  if (batchIds.length === 0) return [];
  const [quantityRows] = await pool.query<QuantityStepRow[]>(
    `${QUANTITY_STEP_SELECT} (${batchIds.map(() => '?').join(',')})
     ORDER BY step_record.production_batch_id,step_record.step_order_snapshot,step_record.id`,
    batchIds,
  );
  const supplementsByBatch = await selectRouteSupplementSources(pool, batchIds);
  const stepsByBatch = new Map<string, QuantityStepRow[]>();
  for (const step of quantityRows) {
    const batchId = String(step.production_batch_id);
    stepsByBatch.set(batchId, [...(stepsByBatch.get(batchId) ?? []), step]);
  }
  const quantitiesByStep = new Map<string, RouteStepQuantity>();
  const firstStepIds = new Set<string>();
  for (const batchId of batchIds) {
    const batchSteps = stepsByBatch.get(batchId) ?? [];
    if (batchSteps[0]) firstStepIds.add(String(batchSteps[0].id));
    const plannedQuantity = rows.find(
      (row) => String(row.production_batch_id) === batchId,
    )!.planned_quantity;
    const quantities = calculateRouteStepQuantities(
      plannedQuantity,
      batchSteps.map<RouteQuantityStep>((step) => ({
        id: step.id,
        stepOrder: step.step_order_snapshot,
        needRecord: Boolean(step.need_record_snapshot),
        status: step.status,
        effectiveDirectReported: step.effective_direct_reported,
        effectiveNormal: step.effective_normal,
      })),
      supplementsByBatch.get(batchId) ?? [],
    );
    for (const [stepId, quantity] of quantities) quantitiesByStep.set(stepId, quantity);
  }
  return rows.map((row) =>
    mapWorkerTask(
      row,
      quantitiesByStep.get(String(row.step_record_id))!,
      firstStepIds.has(String(row.step_record_id)),
    ),
  );
};

const mapWorkerTask = (
  row: WorkerTaskRow,
  quantity: RouteStepQuantity,
  isFirst: boolean,
): ProductionWorkerTaskItem => {
  const upstreamReady = isFirst
    ? row.batch_status === 'material_outbound' || Boolean(row.short_batch_startable)
    : integerQuantity(quantity.releasedInputQuantity) > 0;
  const canComplete =
    row.step_status === 'doing' &&
    !row.need_record &&
    row.batch_status === 'doing' &&
    (isFirst || row.previous_status === 'completed');
  return {
    stepRecordId: String(row.step_record_id),
    productionBatchId: String(row.production_batch_id),
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
    needRecord: Boolean(row.need_record),
    unit: row.unit_snapshot,
    plannedQuantity: row.planned_quantity,
    baseNormalQuantity: row.planned_quantity,
    requiredNormalQuantity: quantity.requiredNormalQuantity,
    releasedNormalQuantity: quantity.releasedInputQuantity,
    availableNormalQuantity: quantity.availableReportQuantity,
    effectiveReportedQuantity: row.effective_reported,
    effectiveDirectReportedQuantity: row.effective_direct_reported,
    effectiveNormalQuantity: row.effective_normal,
    effectiveAbnormalQuantity: row.effective_abnormal,
    activatedSupplementInputQuantity: quantity.activatedSupplementInputQuantity,
    activatedSupplementTargetQuantity: quantity.activatedSupplementTargetQuantity,
    pendingSupplementInputQuantity: quantity.pendingSupplementInputQuantity,
    isSupplementReopened: quantity.isSupplementReopened,
    supplementBlockedReason: quantity.supplementBlockedReason,
    startedAt: row.started_at ? toBeijingISOString(row.started_at) : null,
    version: row.version,
    canStart:
      row.step_status === 'assigned' && upstreamReady && (isFirst || row.batch_status === 'doing'),
    startBlockedReason:
      row.step_status !== 'assigned'
        ? null
        : upstreamReady
          ? null
          : isFirst
            ? '等待生产领料全部出库'
            : '等待上一道工序释放正常数量',
    canComplete,
    completeBlockedReason:
      row.step_status === 'doing' && !row.need_record && !canComplete
        ? isFirst
          ? '生产批次尚未进入执行中'
          : '等待上一道工序完成'
        : null,
  };
};
