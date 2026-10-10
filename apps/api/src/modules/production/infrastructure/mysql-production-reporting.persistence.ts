import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { BatchStepReportDependency, CreateBatchStepReportPayload } from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import { allocateBusinessNumber } from '../../../infrastructure/numbering/mysql-business-number.js';
import { integerQuantity } from '../domain/integer-quantity.js';
import { calculateRouteStepQuantities } from '../domain/production-route-quantity.policy.js';
import {
  reportingPhase,
  reportWriteEligibility,
  reportCorrectionEligibility,
  type ProductionReportingAccess,
} from '../domain/production-reporting.policy.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { findBatch } from './mysql-production.shared.js';
import { lockWorkOrderForBatch } from './mysql-work-order-material-version.js';
import { selectRouteSupplementSources } from './mysql-production-supplement-activation.js';
import { fixed } from './mysql-production-reporting-quantity.js';
import {
  mapReport,
  type DispositionRow,
  type ProjectionStepRow,
  type ReportRow,
} from './mysql-production-reporting.projection.js';

type Db = Pool | PoolConnection;
export type ReportingPhase = 'execution' | 'history';
const DIRECT_FACT = `NOT EXISTS (SELECT 1 FROM rework_records rw
  WHERE rw.completed_normal_report_id IN (r.id,r.reversal_of_report_id)
    OR rw.completed_abnormal_report_id IN (r.id,r.reversal_of_report_id))`;
export const REPORT_SUMMARY_COLUMNS = `
  COALESCE(SUM(CASE WHEN r.report_type='normal' THEN r.reported_quantity ELSE -r.reported_quantity END),0) effective_reported,
  COALESCE(SUM(CASE WHEN ${DIRECT_FACT} THEN CASE WHEN r.report_type='normal' THEN r.reported_quantity ELSE -r.reported_quantity END ELSE 0 END),0) effective_direct_reported,
  COALESCE(SUM(CASE WHEN ${DIRECT_FACT} THEN CASE WHEN r.report_type='normal' THEN r.normal_quantity ELSE -r.normal_quantity END ELSE 0 END),0) effective_direct_normal,
  COALESCE(SUM(CASE WHEN ${DIRECT_FACT} THEN CASE WHEN r.report_type='normal' THEN r.abnormal_quantity ELSE -r.abnormal_quantity END ELSE 0 END),0) effective_direct_abnormal,
  COALESCE(SUM(CASE WHEN r.report_type='normal' THEN r.normal_quantity ELSE -r.normal_quantity END),0) effective_normal,
  COALESCE(SUM(CASE WHEN r.report_type='normal' THEN r.abnormal_quantity ELSE -r.abnormal_quantity END),0) effective_abnormal,
  COUNT(r.id) report_count, MIN(r.created_at) first_reported_at, MAX(r.created_at) last_reported_at`;
const STEP_FIELDS = `sr.id,sr.production_batch_id,sr.step_order_snapshot,sr.step_code_snapshot,sr.step_name_snapshot,
  sr.status,sr.responsible_user_id,sr.unit_snapshot,sr.started_at,sr.completed_at,sr.version`;
const PROJECTION_STEP_FROM = `SELECT ${STEP_FIELDS},${REPORT_SUMMARY_COLUMNS}
  FROM batch_step_records sr LEFT JOIN batch_step_reports r ON r.batch_step_record_id=sr.id`;
export const PROJECTION_STEP_SELECT = `${PROJECTION_STEP_FROM}
  WHERE sr.production_batch_id=? GROUP BY sr.id ORDER BY sr.step_order_snapshot,sr.id`;

/** 页内批次的路线摘要只批量查询一次，不返回其它工序的事实明细。 */
export async function selectProjectionStepsByBatchIds(
  db: Db,
  batchIds: readonly string[],
): Promise<ProjectionStepRow[]> {
  if (batchIds.length === 0) return [];
  const [rows] = await db.query<ProjectionStepRow[]>(
    `${PROJECTION_STEP_FROM} WHERE sr.production_batch_id IN (${batchIds.map(() => '?').join(',')})
     GROUP BY sr.id ORDER BY sr.production_batch_id,sr.step_order_snapshot,sr.id`,
    [...batchIds],
  );
  return rows;
}
const REPORT_BASE_FIELDS = `r.id,r.report_no,r.production_batch_id,r.batch_step_record_id,r.report_type,
  r.reversal_of_report_id,r.replaces_report_id,r.reported_quantity,r.normal_quantity,r.abnormal_quantity,
  r.abnormal_origin,r.unit_snapshot,r.remark,r.created_by,r.created_at`;
export const REPORT_FIELDS = `${REPORT_BASE_FIELDS},CASE WHEN r.report_type='reversal' THEN 1
  WHEN NOT EXISTS (SELECT 1 FROM batch_step_reports reversal WHERE reversal.reversal_of_report_id=r.id) THEN 1 ELSE 0 END is_effective`;
export const DISPOSITION_SELECT = `SELECT d.id,d.disposition_no,d.production_batch_id,d.batch_step_record_id,d.batch_step_report_id,
  source_report.abnormal_origin,source_report.abnormal_quantity source_abnormal_quantity,d.review_status,d.disposition_type,d.remark,d.version,d.created_at
  FROM batch_step_abnormal_dispositions d JOIN batch_step_reports source_report ON source_report.id=d.batch_step_report_id`;

export const numericIdOrder = (left: string, right: string): number => {
  const a = BigInt(left);
  const b = BigInt(right);
  return a === b ? 0 : a < b ? -1 : 1;
};

export async function pendingReportingApproval(
  db: Db,
  batchId: string,
  lock = false,
): Promise<string | null> {
  const [[row]] = await db.query<(RowDataPacket & { pending_approval_id: number | null })[]>(
    `SELECT pending_approval_id FROM production_batch_closeout WHERE production_batch_id=?${lock ? ' FOR UPDATE' : ''}`,
    [batchId],
  );
  return row?.pending_approval_id == null ? null : String(row.pending_approval_id);
}

/** 当前读锁序：工单 → 任务 → 结案根 → 工序路线序 → 报工 ID。 */
export async function lockReportingContext(db: PoolConnection, batchId: string) {
  await lockWorkOrderForBatch(db, batchId);
  const batch = await findBatch(db, batchId, true);
  const pendingApprovalId = await pendingReportingApproval(db, batchId, true);
  const [steps] = await db.query<ProjectionStepRow[]>(
    `SELECT ${STEP_FIELDS} FROM batch_step_records sr WHERE sr.production_batch_id=? ORDER BY sr.step_order_snapshot,sr.id FOR UPDATE`,
    [batchId],
  );
  const [reports] = await db.query<ReportRow[]>(
    `SELECT ${REPORT_BASE_FIELDS},1 is_effective FROM batch_step_reports r WHERE r.production_batch_id=? ORDER BY r.id FOR UPDATE`,
    [batchId],
  );
  const [reworks] = await db.query<
    (RowDataPacket & {
      completed_normal_report_id: number | null;
      completed_abnormal_report_id: number | null;
    })[]
  >(
    `SELECT completed_normal_report_id,completed_abnormal_report_id FROM rework_records
     WHERE production_batch_id=? AND (completed_normal_report_id IS NOT NULL OR completed_abnormal_report_id IS NOT NULL)
     ORDER BY id FOR SHARE`,
    [batchId],
  );
  const reworkIds = new Set(
    reworks.flatMap((row) =>
      [row.completed_normal_report_id, row.completed_abnormal_report_id]
        .filter((id): id is number => id !== null)
        .map(String),
    ),
  );
  const reversedIds = new Set(
    reports
      .filter((row) => row.reversal_of_report_id !== null)
      .map((row) => String(row.reversal_of_report_id)),
  );
  for (const report of reports)
    report.is_effective =
      report.report_type === 'reversal' || !reversedIds.has(String(report.id)) ? 1 : 0;
  for (const step of steps) summarizeLockedStep(step, reports, reworkIds);
  const supplements = (await selectRouteSupplementSources(db, [batchId], true)).get(batchId) ?? [];
  const quantities = calculateRouteStepQuantities(
    batch.planned_quantity,
    steps.map(toRouteQuantityStep),
    supplements,
  );
  return { batch, pendingApprovalId, steps, reports, supplements, quantities };
}
export type ReportingContext = Awaited<ReturnType<typeof lockReportingContext>>;

function summarizeLockedStep(
  step: ProjectionStepRow,
  reports: ReportRow[],
  reworkIds: Set<string>,
) {
  let normal = 0,
    abnormal = 0,
    directNormal = 0,
    directAbnormal = 0;
  const facts = reports.filter((row) => String(row.batch_step_record_id) === String(step.id));
  for (const row of facts) {
    const sign = row.report_type === 'normal' ? 1 : -1;
    const n = sign * integerQuantity(row.normal_quantity);
    const a = sign * integerQuantity(row.abnormal_quantity);
    normal = integerQuantity(normal + n);
    abnormal = integerQuantity(abnormal + a);
    if (!reworkIds.has(String(row.id)) && !reworkIds.has(String(row.reversal_of_report_id))) {
      directNormal = integerQuantity(directNormal + n);
      directAbnormal = integerQuantity(directAbnormal + a);
    }
  }
  step.effective_normal = fixed(normal);
  step.effective_abnormal = fixed(abnormal);
  step.effective_reported = fixed(normal + abnormal);
  step.effective_direct_normal = fixed(directNormal);
  step.effective_direct_abnormal = fixed(directAbnormal);
  step.effective_direct_reported = fixed(directNormal + directAbnormal);
  step.report_count = facts.length;
  step.first_reported_at = facts[0]?.created_at ?? null;
  step.last_reported_at = facts.at(-1)?.created_at ?? null;
}

export const toRouteQuantityStep = (step: ProjectionStepRow) => ({
  id: step.id,
  stepOrder: step.step_order_snapshot,
  status: step.status,
  effectiveDirectReported: step.effective_direct_reported,
  effectiveNormal: step.effective_normal,
});

export function requireReportingWrite(
  context: ReportingContext,
  step: ProjectionStepRow,
  access: ProductionReportingAccess,
  phase: ReportingPhase,
  intent: 'create' | 'correction',
) {
  const eligibility = reportWriteEligibility(
    context.batch.status,
    context.pendingApprovalId,
    step.status,
    step.responsible_user_id === null ? null : String(step.responsible_user_id),
    access,
    context.quantities.get(String(step.id))!.availableReportQuantity,
  );
  const reason =
    phase === 'history'
      ? eligibility.historicalCorrectionBlockedReason
      : intent === 'create'
        ? eligibility.reportBlockedReason
        : eligibility.correctionBlockedReason;
  if (reason)
    throw new ProductionDomainError(
      !access.canManageExecution && String(step.responsible_user_id) !== access.actorId
        ? 'NOT_STEP_ASSIGNEE'
        : 'STEP_REPORT_NOT_ALLOWED',
      reason,
    );
}

export function requireReportVersion(step: ProjectionStepRow, version: number) {
  if (step.version !== version)
    throw new ProductionDomainError('CONCURRENT_MODIFICATION', '工序状态已变化，请刷新后重试');
}

export async function reportDependencies(
  db: Db,
  ids: string[],
  lock = false,
): Promise<Map<string, BatchStepReportDependency[]>> {
  const result = new Map<string, BatchStepReportDependency[]>();
  if (!ids.length) return result;
  const placeholders = ids.map(() => '?').join(',');
  const share = lock ? ' FOR SHARE' : '';
  const sources: Array<{ kind: BatchStepReportDependency['kind']; sql: string }> = [
    {
      kind: 'abnormal_disposition',
      sql: `SELECT id,batch_step_report_id report_id FROM batch_step_abnormal_dispositions WHERE batch_step_report_id IN (${placeholders}) ORDER BY id${share}`,
    },
    {
      kind: 'replacement_report',
      sql: `SELECT id,replaces_report_id report_id FROM batch_step_reports WHERE replaces_report_id IN (${placeholders}) ORDER BY id${share}`,
    },
    {
      kind: 'rework_source',
      sql: `SELECT id,source_report_id report_id FROM rework_records WHERE source_report_id IN (${placeholders}) ORDER BY id${share}`,
    },
    {
      kind: 'rework_completion',
      sql: `SELECT id,completed_normal_report_id report_id FROM rework_records WHERE completed_normal_report_id IN (${placeholders}) ORDER BY id${share}`,
    },
    {
      kind: 'rework_completion',
      sql: `SELECT id,completed_abnormal_report_id report_id FROM rework_records WHERE completed_abnormal_report_id IN (${placeholders}) ORDER BY id${share}`,
    },
    {
      kind: 'scrap_record',
      sql: `SELECT id,source_report_id report_id FROM batch_step_scrap_records WHERE source_report_id IN (${placeholders}) ORDER BY id${share}`,
    },
  ];
  for (const { kind, sql } of sources) {
    const [rows] = await db.query<(RowDataPacket & { id: number; report_id: number })[]>(sql, ids);
    for (const row of rows) {
      const key = String(row.report_id);
      result.set(key, [...(result.get(key) ?? []), { kind, id: String(row.id) }]);
    }
  }
  return result;
}

/** 普通纠错只替代或撤回纯正常直接报工，不产生新的异常执行链。 */
export function normalOnlyReportReason(report: ReportRow, phase: ReportingPhase): string | null {
  const normal = integerQuantity(report.normal_quantity);
  const abnormal = integerQuantity(report.abnormal_quantity);
  if (abnormal > 0)
    return normal > 0
      ? '正常异常混合报工不能通用冲销或更正'
      : '异常报工不能通用冲销或更正；待处置记录请驳回后重新报工';
  if (
    normal <= 0 ||
    abnormal !== 0 ||
    report.abnormal_origin !== null ||
    integerQuantity(report.reported_quantity) !== normal
  )
    return phase === 'history'
      ? '结案后只允许大于零的纯正常普通报工历史纠错'
      : '只允许大于零的纯正常普通报工冲销或更正';
  return null;
}

export function correctableReportReason(
  report: ReportRow,
  dependencies: BatchStepReportDependency[],
  phase: ReportingPhase,
): string | null {
  if (report.report_type !== 'normal' || !report.is_effective)
    return '原报工已经冲销或不是有效普通报工';
  if (dependencies.some((dependency) => dependency.kind === 'rework_completion'))
    return '返工完成结果受来源业务保护，不能通用冲销或更正';
  const normalOnlyReason = normalOnlyReportReason(report, phase);
  if (normalOnlyReason) return normalOnlyReason;
  if (dependencies.length) return '该报工已有异常处置、返工、报废或替代依赖，不能通用冲销或更正';
  return null;
}

export function mapEligibleReport(
  report: ReportRow,
  step: ProjectionStepRow,
  batchStatus: ReportingContext['batch']['status'],
  pendingApprovalId: string | null,
  access: ProductionReportingAccess,
  dependencies: BatchStepReportDependency[],
) {
  const phase = reportingPhase(batchStatus);
  const write = reportCorrectionEligibility(
    batchStatus,
    pendingApprovalId,
    step.status,
    step.responsible_user_id === null ? null : String(step.responsible_user_id),
    access,
  );
  const stageReason =
    phase === 'history' ? write.historicalCorrectionBlockedReason : write.correctionBlockedReason;
  const reason =
    stageReason ??
    correctableReportReason(report, dependencies, phase === 'history' ? 'history' : 'execution');
  return mapReport(report, {
    canReverse: reason === null,
    canCorrect: reason === null,
    correctionBlockedReason: reason,
  });
}

export async function insertReportingFact(
  db: PoolConnection,
  input: {
    batchId: string;
    stepRecordId: string;
    reportType: 'normal' | 'reversal';
    normalQuantity: number;
    abnormalQuantity: number;
    abnormalOrigin: CreateBatchStepReportPayload['abnormalOrigin'];
    unit: string;
    remark: string | null;
    actorId: string;
    reversalOfReportId?: string;
    replacesReportId?: string;
  },
): Promise<string> {
  const [result] = await db.execute<ResultSetHeader>(
    `INSERT INTO batch_step_reports (report_no,production_batch_id,batch_step_record_id,report_type,reversal_of_report_id,replaces_report_id,
     reported_quantity,normal_quantity,abnormal_quantity,abnormal_origin,unit_snapshot,remark,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      await allocateBusinessNumber(db, 'step_report'),
      input.batchId,
      input.stepRecordId,
      input.reportType,
      input.reversalOfReportId ?? null,
      input.replacesReportId ?? null,
      fixed(input.normalQuantity + input.abnormalQuantity),
      fixed(input.normalQuantity),
      fixed(input.abnormalQuantity),
      input.abnormalOrigin ?? null,
      input.unit,
      input.remark,
      input.actorId,
    ],
  );
  return String(result.insertId);
}

export async function insertReportingDisposition(
  db: PoolConnection,
  batchId: string,
  stepRecordId: string,
  reportId: string,
  actorId: string,
): Promise<string> {
  const [result] = await db.execute<ResultSetHeader>(
    `INSERT INTO batch_step_abnormal_dispositions (disposition_no,production_batch_id,batch_step_record_id,batch_step_report_id,review_status,created_by,updated_by)
     VALUES (?,?,?,?,'pending_review',?,?)`,
    [
      await allocateBusinessNumber(db, 'abnormal_disposition'),
      batchId,
      stepRecordId,
      reportId,
      actorId,
      actorId,
    ],
  );
  return String(result.insertId);
}

/** 数量事实只推进版本；状态和实际开完工时间只由明确动作改变。 */
export async function advanceReportingStepVersion(
  db: PoolConnection,
  step: ProjectionStepRow,
  actorId: string,
): Promise<void> {
  const [result] = await db.execute<ResultSetHeader>(
    'UPDATE batch_step_records SET version=version+1,updated_by=? WHERE id=? AND version=?',
    [actorId, step.id, step.version],
  );
  if (result.affectedRows !== 1)
    throw new ProductionDomainError('CONCURRENT_MODIFICATION', '工序已变化，请刷新后重试');
}

export async function selectReportingFact(db: Db, reportId: string): Promise<ReportRow> {
  const [[row]] = await db.query<ReportRow[]>(
    `SELECT ${REPORT_FIELDS} FROM batch_step_reports r WHERE r.id=?`,
    [reportId],
  );
  if (!row) throw new ProductionDomainError('NOT_FOUND', '报工事实不存在');
  return row;
}
export async function selectReportingDisposition(db: Db, id: string): Promise<DispositionRow> {
  const [[row]] = await db.query<DispositionRow[]>(`${DISPOSITION_SELECT} WHERE d.id=?`, [id]);
  if (!row) throw new ProductionDomainError('NOT_FOUND', '异常处置单不存在');
  return row;
}
export const auditReporting = (
  db: PoolConnection,
  context: CommandContext,
  action: string,
  targetId: string,
  afterData: unknown,
) =>
  writeTransactionalAudit(db, {
    logType: 'business',
    module: 'production',
    action,
    userId: context.actorId,
    targetId,
    targetType: 'batch_step_report',
    result: 'success',
    beforeData: null,
    afterData,
    requestId: context.requestId,
    ip: context.ip,
    userAgent: context.userAgent,
  });
