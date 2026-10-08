import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import type {
  FinishedInspectionTaskItem,
  FinishedInspectionTaskQuery,
  FinishedInspectionStage,
  FinishedInspectionNextAction,
  PageResult,
  ProductionOutputQuantities,
  ProductionOutputReleaseDecision,
} from '@company/contracts';
import { toBeijingISOString } from '../../../../common/time/date-time.js';
type Db = Pool | PoolConnection;
type TaskRow = RowDataPacket & {
  batch_id: number;
  batch_no: string;
  work_order_id: number;
  work_order_no: string;
  product_code_snapshot: string;
  product_name_snapshot: string;
  planned_quantity: string;
  version: number;
  current_round_id: number | null;
  current_round_status: FinishedInspectionTaskItem['currentRoundStatus'];
  current_round_no: number | null;
  current_round_trigger_type: FinishedInspectionTaskItem['currentRoundTriggerType'];
  current_round_reason: string | null;
  baseline_planned_received: string | null;
  baseline_extra_received: string | null;
  starting_declared_remaining: string | null;
  current_inspection_id: number | null;
  current_release_decision: ProductionOutputReleaseDecision | null;
  latest_id: number | null;
  release_decision: ProductionOutputReleaseDecision | null;
  inspected_at: Date | null;
  pending_approval_id: number | null;
  current_revision_id: number | null;
  correction_reason: string | null;
  available_quantity: string | null;
  extra_quantity: string | null;
  additional_scrap_quantity: string | null;
  status: string;
};
const SELECT = `SELECT b.id batch_id,b.batch_no,b.work_order_id,w.work_order_no,w.product_code_snapshot,w.product_name_snapshot,b.planned_quantity,b.status,c.version,c.current_round_id,round.status current_round_status,round.round_no current_round_no,round.trigger_type current_round_trigger_type,round.reason current_round_reason,round.baseline_planned_received,round.baseline_extra_received,round.starting_declared_remaining,c.pending_approval_id,c.current_revision_id,c.correction_reason,c.available_quantity,c.extra_quantity,c.additional_scrap_quantity,i.id latest_id,i.release_decision,i.inspected_at,current_inspection.id current_inspection_id,current_inspection.release_decision current_release_decision FROM production_batch_closeout c LEFT JOIN production_output_round round ON round.id=c.current_round_id JOIN production_batches b ON b.id=c.production_batch_id JOIN work_orders w ON w.id=b.work_order_id
 LEFT JOIN quality_inspection_record i ON i.id=(SELECT MAX(latest.id) FROM quality_inspection_record latest WHERE latest.closeout_id=c.id)
 LEFT JOIN quality_inspection_case current_case ON current_case.finished_round_id=round.id AND current_case.source_kind='finished'
 LEFT JOIN quality_inspection_record current_inspection ON current_inspection.case_id=current_case.id`;
const PENDING = `c.available_quantity IS NOT NULL AND c.pending_approval_id IS NULL AND (
  round.status='inspecting' OR
  (round.status='pending_inspection' AND (round.trigger_type<>'finalization_correction' OR i.id IS NULL OR i.release_decision<>'released')) OR
  (round.status='pending_finalization' AND current_inspection.release_decision IN ('pending_reinspection','not_released'))
)`;
function nextWorkflow(
  row: TaskRow,
  canBeginReinspection: boolean,
): {
  stage: FinishedInspectionStage;
  nextAction: FinishedInspectionNextAction;
} {
  if (row.pending_approval_id !== null) return { stage: 'reviewing', nextAction: 'view_approval' };
  if (row.available_quantity === null) return { stage: 'awaiting_draft', nextAction: 'save_draft' };
  if (row.current_round_status === 'inspecting')
    return { stage: 'inspecting', nextAction: 'record_inspection' };
  if (row.current_round_status === 'pending_inspection') {
    if (
      row.current_round_trigger_type === 'finalization_correction' &&
      row.release_decision === 'released'
    )
      return { stage: 'ready_for_finalization', nextAction: 'review_output' };
    return { stage: 'awaiting_start', nextAction: 'start_inspection' };
  }
  if (row.current_release_decision === 'pending_reinspection')
    return {
      stage: 'needs_reinspection',
      nextAction: canBeginReinspection ? 'start_reinspection' : 'view_history',
    };
  if (row.current_release_decision === 'not_released')
    return {
      stage: 'not_released',
      nextAction: canBeginReinspection ? 'start_reinspection' : 'view_history',
    };
  if (row.current_round_status === 'pending_finalization')
    return { stage: 'ready_for_finalization', nextAction: 'review_output' };
  if (row.current_round_status === 'finalized')
    return { stage: 'approved', nextAction: 'view_history' };
  return {
    stage: 'blocked',
    nextAction: canBeginReinspection ? 'start_reinspection' : 'view_history',
  };
}
function mapTask(row: TaskRow): FinishedInspectionTaskItem {
  const reinspectionBlockedReason =
    row.pending_approval_id !== null
      ? '清单正在审批中，请先撤回或驳回'
      : row.available_quantity === null
        ? '请先保存产出草稿'
        : row.latest_id === null
          ? '当前尚无检验记录，请先完成首次检验'
          : row.current_round_status === 'inspecting'
            ? '本轮检验正在填写，请继续登记结果'
            : row.current_round_status === 'pending_inspection' &&
                row.current_round_trigger_type !== 'finalization_correction'
              ? '本轮检验尚未开始，请先完成当前轮次'
              : row.current_round_status === 'reviewing'
                ? '清单正在审批中，请先撤回或驳回'
                : row.current_round_status === 'pending_finalization' ||
                    row.current_round_status === 'finalized' ||
                    row.current_round_status === 'superseded' ||
                    (row.current_round_status === 'pending_inspection' &&
                      row.current_round_trigger_type === 'finalization_correction')
                  ? null
                  : '当前轮次不能发起复检';
  const canBeginReinspection = reinspectionBlockedReason === null;
  const workflow = nextWorkflow(row, canBeginReinspection);
  return {
    batchId: String(row.batch_id),
    batchNo: row.batch_no,
    workOrderId: String(row.work_order_id),
    workOrderNo: row.work_order_no,
    productCode: row.product_code_snapshot,
    productName: row.product_name_snapshot,
    plannedQuantity: String(row.planned_quantity),
    version: row.version,
    currentRoundId: row.current_round_id === null ? null : String(row.current_round_id),
    currentRoundStatus: row.current_round_status,
    currentRoundNo: row.current_round_no,
    currentRoundTriggerType: row.current_round_trigger_type,
    currentRoundReason: row.current_round_reason,
    baselinePlannedReceived:
      row.baseline_planned_received === null ? null : String(row.baseline_planned_received),
    baselineExtraReceived:
      row.baseline_extra_received === null ? null : String(row.baseline_extra_received),
    startingDeclaredRemaining:
      row.starting_declared_remaining === null ? null : String(row.starting_declared_remaining),
    currentRoundInspectionId:
      row.current_inspection_id === null ? null : String(row.current_inspection_id),
    currentRevisionId: row.current_revision_id === null ? null : String(row.current_revision_id),
    latestInspectionId: row.latest_id === null ? null : String(row.latest_id),
    latestReleaseDecision: row.release_decision,
    latestInspectedAt: row.inspected_at === null ? null : toBeijingISOString(row.inspected_at),
    canStartInspection:
      ['closing', 'completed', 'terminated'].includes(row.status) &&
      row.pending_approval_id === null &&
      (row.current_revision_id === null || row.correction_reason !== null) &&
      row.available_quantity !== null &&
      row.current_round_status === 'pending_inspection',
    canRecordInspection:
      ['closing', 'completed', 'terminated'].includes(row.status) &&
      row.pending_approval_id === null &&
      (row.current_revision_id === null || row.correction_reason !== null) &&
      row.available_quantity !== null &&
      row.current_round_status === 'inspecting',
    canBeginReinspection,
    reinspectionBlockedReason,
    ...workflow,
  };
}
export async function listFinishedInspectionTasks(
  db: Db,
  query: FinishedInspectionTaskQuery,
): Promise<PageResult<FinishedInspectionTaskItem>> {
  const page = query.page ?? 1,
    pageSize = query.pageSize ?? 10,
    clauses: string[] = [],
    values: unknown[] = [];
  if (query.keyword?.trim()) {
    clauses.push(
      '(b.batch_no LIKE ? OR w.work_order_no LIKE ? OR w.product_code_snapshot LIKE ? OR w.product_name_snapshot LIKE ?)',
    );
    values.push(...Array(4).fill(`%${query.keyword.trim()}%`));
  }
  if (query.status === 'pending') clauses.push(`(${PENDING})`);
  if (query.status === 'recorded') clauses.push('i.id IS NOT NULL');
  const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
  const [[count]] = await db.query<(RowDataPacket & { total: number })[]>(
    `SELECT COUNT(*) total FROM (${SELECT}${where}) matching_tasks`,
    values,
  );
  const [rows] = await db.query<TaskRow[]>(
    `${SELECT}${where} ORDER BY c.updated_at DESC,c.id DESC LIMIT ? OFFSET ?`,
    [...values, pageSize, (page - 1) * pageSize],
  );
  return { items: rows.map(mapTask), total: Number(count?.total ?? 0), page, pageSize };
}
export async function readFinishedInspectionTask(
  db: Db,
  batchId: string,
): Promise<{
  item: FinishedInspectionTaskItem;
  declared: ProductionOutputQuantities | null;
} | null> {
  const [[row]] = await db.query<TaskRow[]>(`${SELECT} WHERE b.id=?`, [batchId]);
  return row
    ? {
        item: mapTask(row),
        declared:
          row.available_quantity === null
            ? null
            : {
                availableQuantity: Number(row.available_quantity),
                extraQuantity: Number(row.extra_quantity),
                additionalScrapQuantity: Number(row.additional_scrap_quantity),
              },
      }
    : null;
}
