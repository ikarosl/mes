import type { PoolConnection } from 'mysql2/promise';
import type {
  BatchReverseStepReportsPayload,
  BatchReverseStepReportsCommandResult,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import {
  advanceReportingStepVersion,
  auditReporting,
  correctableReportReason,
  insertReportingFact,
  lockReportingContext,
  numericIdOrder,
  reportDependencies,
  selectReportingFact,
} from './mysql-production-reporting.persistence.js';
import { invalidateUnapprovedCloseoutBasis } from './mysql-production-closeout-basis.js';
import type { ReportingPhase } from './mysql-production-reporting.persistence.js';
import { MAX_BATCH_STEP_REPORT_REVERSALS } from '@company/constants';
import { createHash } from 'node:crypto';
import type {
  BatchReverseStepReportPreviewItem,
  BatchReverseStepReportSelection,
  BatchReverseStepReportsPreview,
} from '@company/contracts';
import { ProductionDomainError } from '../domain/production.errors.js';
import { calculateRouteStepQuantities } from '../domain/production-route-quantity.policy.js';
import { reportingPhase } from '../domain/production-reporting.policy.js';
import { integerQuantity } from '../domain/integer-quantity.js';
import { fixed } from './mysql-production-reporting-quantity.js';
import {
  mapQuantityProjection,
  mapReport,
  type ProjectionStepRow,
} from './mysql-production-reporting.projection.js';
import type { ReportingContext } from './mysql-production-reporting.persistence.js';
import { toRouteQuantityStep } from './mysql-production-reporting.persistence.js';

export function requireBulkReportSelection(reports: BatchReverseStepReportSelection[]): void {
  if (reports.length < 1 || reports.length > MAX_BATCH_STEP_REPORT_REVERSALS)
    throw new ProductionDomainError(
      'INVALID_INPUT',
      `请选择1至${MAX_BATCH_STEP_REPORT_REVERSALS}条报工记录`,
    );
  if (new Set(reports.map((item) => item.reportId)).size !== reports.length)
    throw new ProductionDomainError('INVALID_INPUT', '同一次批量冲销不得重复选择报工ID');
  for (const item of reports) {
    if (
      !/^[1-9]\d{0,19}$/.test(item.reportId) ||
      !/^[1-9]\d{0,19}$/.test(item.stepRecordId) ||
      !Number.isSafeInteger(item.version) ||
      item.version < 0
    )
      throw new ProductionDomainError('INVALID_INPUT', '报工ID、工序ID或版本无效');
  }
}

export function previewBulkReportReversal(
  context: ReportingContext,
  selection: BatchReverseStepReportSelection[],
  dependencies: Awaited<ReturnType<typeof reportDependencies>>,
): BatchReverseStepReportsPreview {
  const { batch, pendingApprovalId, steps, reports, quantities, supplements } = context;
  const phase = reportingPhase(batch.status);
  const byStep = new Map(steps.map((step) => [String(step.id), step]));
  const byReport = new Map(reports.map((report) => [String(report.id), report]));
  const items: BatchReverseStepReportPreviewItem[] = selection.map((item) => {
    const report = byReport.get(item.reportId);
    const step = byStep.get(item.stepRecordId);
    const deps = dependencies.get(item.reportId) ?? [];
    let blockedCode: BatchReverseStepReportPreviewItem['blockedCode'] = null;
    let blockedReason: string | null = null;
    if (pendingApprovalId !== null) {
      blockedCode = 'approval_pending';
      blockedReason = '结案或产出更正在审批，报工纠错冻结';
    } else if (phase === 'unavailable') {
      blockedCode = 'batch_not_allowed';
      blockedReason = '任务阶段不允许报工冲销';
    } else if (!step || !report) {
      blockedCode = 'not_found';
      blockedReason = '所选报工或工序不属于当前任务，或已不存在';
    } else if (String(report.batch_step_record_id) !== item.stepRecordId) {
      blockedCode = 'step_mismatch';
      blockedReason = '所选报工与工序身份不一致';
    } else if (step.version !== item.version) {
      blockedCode = 'version_changed';
      blockedReason = '工序版本已变化，请刷新并重新核对选择';
    } else if (report.report_type !== 'normal' || !report.is_effective) {
      blockedCode = 'not_effective_normal';
      blockedReason = '只能全量冲销仍有效的普通正向报工';
    } else if (deps.length > 0) {
      blockedCode = 'business_dependency';
      blockedReason = correctableReportReason(report, deps, phase);
    } else if (correctableReportReason(report, deps, phase) !== null) {
      blockedCode = phase === 'history' ? 'historical_normal_only' : 'normal_only';
      blockedReason = correctableReportReason(report, deps, phase);
    } else if (phase === 'execution' && !['doing', 'completed'].includes(step.status)) {
      blockedCode = 'step_not_started';
      blockedReason = '执行期间只能冲销已开始或已完成工序的报工';
    }
    return {
      ...item,
      report: report
        ? mapReport(report, {
            canReverse: blockedCode === null,
            canCorrect: blockedCode === null,
            correctionBlockedReason: blockedReason,
          })
        : null,
      canReverse: blockedCode === null,
      blockedCode,
      blockedReason,
      dependencies: deps,
    };
  });
  const afterSteps = steps.map((step) => ({ ...step }) as ProjectionStepRow);
  const afterByStep = new Map(afterSteps.map((step) => [String(step.id), step]));
  const selectedByStep = new Map<string, string[]>();
  for (const item of items) {
    const report = byReport.get(item.reportId);
    const step = afterByStep.get(item.stepRecordId);
    if (
      !step ||
      !report ||
      report.report_type !== 'normal' ||
      !report.is_effective ||
      String(report.batch_step_record_id) !== item.stepRecordId
    )
      continue;
    const normal = integerQuantity(report.normal_quantity);
    const abnormal = integerQuantity(report.abnormal_quantity);
    step.effective_normal = fixed(integerQuantity(step.effective_normal) - normal);
    step.effective_abnormal = fixed(integerQuantity(step.effective_abnormal) - abnormal);
    step.effective_reported = fixed(integerQuantity(step.effective_reported) - normal - abnormal);
    if (!item.dependencies.some((dependency) => dependency.kind === 'rework_completion')) {
      step.effective_direct_normal = fixed(integerQuantity(step.effective_direct_normal) - normal);
      step.effective_direct_abnormal = fixed(
        integerQuantity(step.effective_direct_abnormal) - abnormal,
      );
      step.effective_direct_reported = fixed(
        integerQuantity(step.effective_direct_reported) - normal - abnormal,
      );
    }
    selectedByStep.set(item.stepRecordId, [
      ...(selectedByStep.get(item.stepRecordId) ?? []),
      item.reportId,
    ]);
  }
  const afterQuantities = calculateRouteStepQuantities(
    batch.planned_quantity,
    afterSteps.map(toRouteQuantityStep),
    supplements,
  );
  const preview = {
    productionBatchId: String(batch.id),
    batchStatus: batch.status,
    batchVersion: batch.version,
    phase,
    pendingApprovalId,
    canReverse: items.every((item) => item.canReverse),
    items,
    affectedSteps: steps.flatMap((step) => {
      const stepId = String(step.id);
      const before = mapQuantityProjection(step, quantities.get(stepId)!);
      const after = mapQuantityProjection(afterByStep.get(stepId)!, afterQuantities.get(stepId)!);
      const ids = selectedByStep.get(stepId) ?? [];
      if (
        !ids.length &&
        before.normalVsPreviousNormalDifference === after.normalVsPreviousNormalDifference &&
        before.directReportedVsPreviousNormalDifference ===
          after.directReportedVsPreviousNormalDifference
      )
        return [];
      return [
        {
          stepRecordId: stepId,
          stepOrder: step.step_order_snapshot,
          stepName: step.step_name_snapshot,
          stepStatus: step.status,
          version: step.version,
          selectedReportIds: ids,
          before,
          after,
        },
      ];
    }),
  };
  const previewToken = createHash('sha256')
    .update(
      JSON.stringify({
        preview,
        supplements,
        steps: steps.map((step) => ({
          id: String(step.id),
          version: step.version,
          status: step.status,
          quantities: mapQuantityProjection(step, quantities.get(String(step.id))!),
        })),
      }),
    )
    .digest('hex');
  return { ...preview, previewToken };
}

export async function reverseBulkReportingFacts(
  db: PoolConnection,
  batchId: string,
  payload: BatchReverseStepReportsPayload,
  context: CommandContext,
): Promise<BatchReverseStepReportsCommandResult> {
  const actorId = context.actorId;
  if (!actorId) throw new ProductionDomainError('INVALID_INPUT', '缺少当前操作人身份');
  const locked = await lockReportingContext(db, batchId);
  const dependencies = await reportDependencies(
    db,
    payload.reports.map((item) => item.reportId),
    true,
  );
  const preview = previewBulkReportReversal(locked, payload.reports, dependencies);
  if (preview.previewToken !== payload.previewToken)
    throw new ProductionDomainError(
      'CONCURRENT_MODIFICATION',
      '批量冲销的阶段、数量或引用依据已变化，请重新预览确认',
      { preview },
    );
  if (!preview.canReverse)
    throw new ProductionDomainError(
      'STEP_REPORT_DEPENDENCY_CONFLICT',
      '批量冲销存在阻断项，未冲销任何报工',
      { preview },
    );
  const reversals: BatchReverseStepReportsCommandResult['reversals'] = [];
  const targetReports = new Map(locked.reports.map((row) => [String(row.id), row]));
  for (const item of [...payload.reports].sort((a, b) => numericIdOrder(a.reportId, b.reportId))) {
    const target = targetReports.get(item.reportId)!;
    const reversalId = await insertReportingFact(db, {
      batchId,
      stepRecordId: item.stepRecordId,
      reportType: 'reversal',
      normalQuantity: integerQuantity(target.normal_quantity),
      abnormalQuantity: integerQuantity(target.abnormal_quantity),
      abnormalOrigin: target.abnormal_origin,
      unit: target.unit_snapshot,
      remark: payload.reason,
      actorId,
      reversalOfReportId: item.reportId,
    });
    await auditReporting(db, context, 'production-step-report.batch-reverse', reversalId, {
      batchId,
      stepRecordId: item.stepRecordId,
      originalReportId: item.reportId,
      selectedReportIds: payload.reports.map((entry) => entry.reportId),
      reason: payload.reason,
      phase: preview.phase,
    });
    reversals.push({
      originalReportId: item.reportId,
      reversal: mapReport(await selectReportingFact(db, reversalId)),
    });
  }
  const selectedStepIds = new Set(payload.reports.map((item) => item.stepRecordId));
  for (const step of locked.steps)
    if (selectedStepIds.has(String(step.id))) await advanceReportingStepVersion(db, step, actorId);
  await invalidateUnapprovedCloseoutBasis(db, batchId, actorId);
  const updated = await lockReportingContext(db, batchId);
  return {
    productionBatchId: batchId,
    batchStatus: updated.batch.status,
    phase: preview.phase as ReportingPhase,
    reversals,
    steps: updated.steps
      .filter((step) =>
        preview.affectedSteps.some((impact) => impact.stepRecordId === String(step.id)),
      )
      .map((step) => ({
        stepRecordId: String(step.id),
        stepStatus: step.status,
        stepVersion: step.version,
        ...mapQuantityProjection(step, updated.quantities.get(String(step.id))!),
      })),
  };
}
