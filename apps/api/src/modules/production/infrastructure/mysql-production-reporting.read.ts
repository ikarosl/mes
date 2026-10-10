import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { PERMISSIONS, PRODUCTION_STEP_PERMISSION_LABELS } from '@company/constants';
import type {
  BatchStepReportDetail,
  BatchStepReportView,
  PageQuery,
  PageResult,
  ProductionExecutionRecordGroup,
} from '@company/contracts';
import { calculateRouteStepQuantities } from '../domain/production-route-quantity.policy.js';
import { evaluateProductionStepActionAvailability } from '../domain/production-step-actions.policy.js';
import {
  reportWriteEligibility,
  reportingPhase,
  type ProductionReportingAccess,
} from '../domain/production-reporting.policy.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { findBatch } from './mysql-production.shared.js';
import {
  calculateStepQuotaDistributions,
  selectStepQuotaFacts,
} from './mysql-production-quota.read.js';
import { selectRouteSupplementSources } from './mysql-production-supplement-activation.js';
import {
  groupRowsBy,
  mapExecutionStep,
  type ProjectionStepRow,
} from './mysql-production-reporting.projection.js';
import {
  mapEligibleReport,
  pendingReportingApproval,
  PROJECTION_STEP_SELECT,
  toRouteQuantityStep,
} from './mysql-production-reporting.persistence.js';
import {
  mapReportProcessingChain,
  mapReportView,
  REPORT_VIEW_SELECT,
  selectDispositionViews,
  selectReportDependencyViews,
  selectReportReworkViews,
  type ReportViewRow,
} from './mysql-production-report-trace.read.js';

const MANAGE_EXECUTION_PERMISSION_LABEL =
  PRODUCTION_STEP_PERMISSION_LABELS[PERMISSIONS.production.steps.manageExecution];

export async function selectBatchExecutionRecords(
  db: PoolConnection,
  batchId: string,
  access: ProductionReportingAccess,
): Promise<ProductionExecutionRecordGroup> {
  const batch = await findBatch(db, batchId);
  const pendingApprovalId = await pendingReportingApproval(db, batchId);
  const [steps] = await db.query<ProjectionStepRow[]>(PROJECTION_STEP_SELECT, [batchId]);
  const quotaFacts = await selectStepQuotaFacts(
    db,
    steps.map((step) => String(step.id)),
  );
  const dispositions = quotaFacts.dispositions;
  const supplements = (await selectRouteSupplementSources(db, [batchId])).get(batchId) ?? [];
  const quantities = calculateRouteStepQuantities(
    batch.planned_quantity,
    steps.map(toRouteQuantityStep),
    supplements,
  );
  const byStep = groupRowsBy(dispositions, (row) => row.stepRecordId);
  const quotaDistributions = calculateStepQuotaDistributions(steps, quantities, quotaFacts);
  const batchReverseBlockedReason = !access.canManageExecution
    ? `批量冲销需要「${MANAGE_EXECUTION_PERMISSION_LABEL}」权限`
    : pendingApprovalId !== null
      ? '结案或产出更正在审批，报工纠错冻结'
      : reportingPhase(batch.status) === 'unavailable'
        ? '任务阶段不允许报工冲销'
        : null;
  return {
    productionBatchId: batchId,
    batchNo: batch.batch_no,
    workOrderId: String(batch.work_order_id),
    workOrderNo: batch.work_order_no,
    productCode: batch.product_code_snapshot,
    productName: batch.product_name_snapshot,
    batchStatus: batch.status,
    plannedQuantity: String(batch.planned_quantity),
    pendingApprovalId,
    canBatchReverse: batchReverseBlockedReason === null,
    batchReverseBlockedReason,
    steps: steps.map((step, index) => {
      const actions = evaluateProductionStepActionAvailability({
        batchStatus: batch.status,
        stepStatus: step.status,
        hasStarted: step.started_at !== null,
        hasResponsibleUser: step.responsible_user_id !== null,
        isFirstStep: index === 0,
        pendingApprovalId,
      });
      if (!access.canManageExecution) {
        actions.canStart = false;
        actions.startBlockedReason = `需要「${MANAGE_EXECUTION_PERMISSION_LABEL}」权限`;
        actions.canComplete = false;
        actions.completeBlockedReason = `需要「${MANAGE_EXECUTION_PERMISSION_LABEL}」权限`;
        actions.canReopen = false;
        actions.reopenBlockedReason = `需要「${MANAGE_EXECUTION_PERMISSION_LABEL}」权限`;
      }
      return mapExecutionStep(
        step,
        batch.planned_quantity,
        quantities.get(String(step.id))!,
        byStep.get(String(step.id)) ?? [],
        reportWriteEligibility(
          batch.status,
          pendingApprovalId,
          step.status,
          step.responsible_user_id === null ? null : String(step.responsible_user_id),
          access,
          quantities.get(String(step.id))!.availableReportQuantity,
        ),
        actions,
        quotaDistributions.get(String(step.id))!,
      );
    }),
  };
}

export async function selectStepReportPage(
  db: PoolConnection,
  batchId: string,
  stepRecordId: string,
  query: PageQuery,
  access: ProductionReportingAccess,
): Promise<PageResult<BatchStepReportView>> {
  const { batch, step, pendingApprovalId } = await selectReportReadContext(
    db,
    batchId,
    stepRecordId,
    access,
  );
  const page = query.page ?? 1,
    pageSize = query.pageSize ?? 10;
  const [[count]] = await db.query<(RowDataPacket & { total: number })[]>(
    'SELECT COUNT(*) total FROM batch_step_reports WHERE production_batch_id=? AND batch_step_record_id=?',
    [batchId, stepRecordId],
  );
  const [rows] = await db.query<ReportViewRow[]>(
    `${REPORT_VIEW_SELECT} WHERE r.production_batch_id=? AND r.batch_step_record_id=? ORDER BY r.created_at DESC,r.id DESC LIMIT ? OFFSET ?`,
    [batchId, stepRecordId, pageSize, (page - 1) * pageSize],
  );
  const reportIds = rows.map((row) => String(row.id));
  const dependencies = await selectReportDependencyViews(db, batchId, reportIds);
  const reworkOrigins = new Map(
    (await selectReportReworkViews(db, batchId, reportIds)).flatMap((row) =>
      [row.completedNormalReportId, row.completedAbnormalReportId]
        .filter((id): id is string => id !== null)
        .map((id) => [id, row] as const),
    ),
  );
  return {
    items: rows.map((row) =>
      mapReportView(
        row,
        mapEligibleReport(
          row,
          step,
          batch.status,
          pendingApprovalId,
          access,
          dependencies.get(String(row.id)) ?? [],
        ),
        reworkOrigins.get(String(row.id)) ?? null,
        dependencies.get(String(row.id)) ?? [],
      ),
    ),
    total: Number(count?.total ?? 0),
    page,
    pageSize,
  };
}

export async function selectStepReportDetail(
  db: PoolConnection,
  batchId: string,
  stepRecordId: string,
  reportId: string,
  access: ProductionReportingAccess,
): Promise<BatchStepReportDetail> {
  requireReadIds(reportId);
  const { batch, step, pendingApprovalId } = await selectReportReadContext(
    db,
    batchId,
    stepRecordId,
    access,
  );
  const [[row]] = await db.query<ReportViewRow[]>(
    `${REPORT_VIEW_SELECT} WHERE r.production_batch_id=? AND r.batch_step_record_id=? AND r.id=?`,
    [batchId, stepRecordId, reportId],
  );
  if (
    !row ||
    String(row.id) !== reportId ||
    String(row.production_batch_id) !== batchId ||
    String(row.batch_step_record_id) !== stepRecordId
  )
    throw new ProductionDomainError('NOT_FOUND', '当前任务工序下没有该报工事实');
  const dependencies =
    (await selectReportDependencyViews(db, batchId, [reportId])).get(reportId) ?? [];
  const reworks = await selectReportReworkViews(db, batchId, [reportId]);
  const reworkOrigin =
    reworks.find(
      (rework) =>
        rework.completedNormalReportId === reportId ||
        rework.completedAbnormalReportId === reportId,
    ) ?? null;
  const dispositions = await selectDispositionViews(db, batchId, [
    ...new Set([reportId, ...reworks.map((rework) => rework.sourceReportId)]),
  ]);
  return {
    ...mapReportView(
      row,
      mapEligibleReport(row, step, batch.status, pendingApprovalId, access, dependencies),
      reworkOrigin,
      dependencies,
    ),
    processingChain: mapReportProcessingChain(dispositions, reworks),
  };
}

/** 列表与详情共用当前归属校验，历史提交人不产生额外读取资格。 */
export async function selectReportReadContext(
  db: PoolConnection,
  batchId: string,
  stepRecordId: string,
  access: ProductionReportingAccess,
) {
  requireReadIds(batchId, stepRecordId);
  const batch = await findBatch(db, batchId);
  const [steps] = await db.query<ProjectionStepRow[]>(PROJECTION_STEP_SELECT, [batchId]);
  const step = steps.find((row) => String(row.id) === stepRecordId);
  if (!step || String(batch.id) !== batchId)
    throw new ProductionDomainError('NOT_FOUND', '批次工序记录不存在');
  if (!access.canReadAllReports && String(step.responsible_user_id) !== access.actorId)
    throw new ProductionDomainError('NOT_STEP_ASSIGNEE', '只能查看当前本人负责工序的报工记录');
  return { batch, step, pendingApprovalId: await pendingReportingApproval(db, batchId) };
}

const requireReadIds = (...ids: string[]): void => {
  if (ids.some((id) => !/^[1-9]\d{0,19}$/.test(id)))
    throw new ProductionDomainError('INVALID_INPUT', '任务、工序及报工 ID 必须为有效正整数');
};
