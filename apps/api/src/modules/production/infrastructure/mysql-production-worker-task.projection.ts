import type { Pool, RowDataPacket } from 'mysql2/promise';
import type {
  BatchStepStatus,
  ProductionBatchStatus,
  ProductionWorkerTaskItem,
} from '@company/contracts';
import { toBeijingISOString } from '../../../common/time/beijing-time.js';

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
  step_status: BatchStepStatus;
  need_record: number;
  unit_snapshot: string;
  effective_normal: string;
  effective_abnormal: string;
  previous_step_id: number | null;
  previous_status: BatchStepStatus | null;
  previous_need_record: number | null;
  previous_effective_normal: string | null;
  started_at: Date | null;
  version: number;
};

const REPORT_SUMMARY = `SELECT batch_step_record_id,
  SUM(CASE WHEN report_type='normal' THEN normal_quantity ELSE -normal_quantity END) effective_normal,
  SUM(CASE WHEN report_type='normal' THEN abnormal_quantity ELSE -abnormal_quantity END) effective_abnormal
  FROM batch_step_reports GROUP BY batch_step_record_id`;

const WORKER_TASK_SELECT = `WITH ordered_steps AS (
  SELECT sr.*,LAG(sr.id) OVER (PARTITION BY sr.production_batch_id ORDER BY sr.step_order_snapshot,sr.id) previous_step_id
  FROM batch_step_records sr
), report_summary AS (${REPORT_SUMMARY})
SELECT current.id step_record_id,current.production_batch_id,b.batch_no,b.status batch_status,
  wo.id work_order_id,wo.work_order_no,b.product_id,wo.product_code_snapshot product_code,
  wo.product_name_snapshot product_name,b.planned_quantity,current.step_order_snapshot step_order,
  current.step_code_snapshot step_code,current.step_name_snapshot step_name,current.status step_status,
  current.need_record_snapshot need_record,current.unit_snapshot,
  COALESCE(current_reports.effective_normal,0) effective_normal,
  COALESCE(current_reports.effective_abnormal,0) effective_abnormal,current.previous_step_id,
  previous.status previous_status,previous.need_record_snapshot previous_need_record,
  COALESCE(previous_reports.effective_normal,0) previous_effective_normal,current.started_at,current.version
FROM ordered_steps current
JOIN production_batches b ON b.id=current.production_batch_id
JOIN work_orders wo ON wo.id=b.work_order_id
LEFT JOIN batch_step_records previous ON previous.id=current.previous_step_id
LEFT JOIN report_summary current_reports ON current_reports.batch_step_record_id=current.id
LEFT JOIN report_summary previous_reports ON previous_reports.batch_step_record_id=previous.id
WHERE current.responsible_user_id=? AND current.status IN ('assigned','doing','completed')
ORDER BY CASE current.status WHEN 'doing' THEN 0 WHEN 'assigned' THEN 1 ELSE 2 END,b.id,current.step_order_snapshot`;

export const selectWorkerTasks = async (
  pool: Pool,
  actorId: string,
): Promise<ProductionWorkerTaskItem[]> => {
  const [rows] = await pool.query<WorkerTaskRow[]>(WORKER_TASK_SELECT, [actorId]);
  return rows.map(mapWorkerTask);
};

const mapWorkerTask = (row: WorkerTaskRow): ProductionWorkerTaskItem => {
  const isFirst = row.previous_step_id === null;
  const releasedNormalQuantity = isFirst
    ? row.planned_quantity
    : row.previous_need_record
      ? (row.previous_effective_normal ?? '0.0000')
      : row.previous_status === 'completed'
        ? row.planned_quantity
        : '0.0000';
  const upstreamReady = isFirst
    ? row.batch_status === 'material_outbound'
    : row.previous_need_record
      ? Number(row.previous_effective_normal) > 0
      : row.previous_status === 'completed';
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
    stepCode: row.step_code,
    stepName: row.step_name,
    status: row.step_status,
    needRecord: Boolean(row.need_record),
    unit: row.unit_snapshot,
    plannedQuantity: row.planned_quantity,
    requiredNormalQuantity: row.planned_quantity,
    releasedNormalQuantity: Number(releasedNormalQuantity).toFixed(4),
    availableNormalQuantity: Math.max(
      0,
      Number(releasedNormalQuantity) -
        Number(row.effective_normal) -
        Number(row.effective_abnormal),
    ).toFixed(4),
    effectiveReportedQuantity: (
      Number(row.effective_normal) + Number(row.effective_abnormal)
    ).toFixed(4),
    effectiveNormalQuantity: row.effective_normal,
    effectiveAbnormalQuantity: row.effective_abnormal,
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
