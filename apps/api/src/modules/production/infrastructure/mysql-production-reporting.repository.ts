import {
  selectBatchExecutionRecords,
  selectStepReportPage,
  selectStepReportDetail,
} from './mysql-production-reporting.read.js';
import { Inject, Injectable } from '@nestjs/common';
import { withTransaction } from '@company/database';
import { PERMISSIONS, PRODUCTION_STEP_PERMISSION_LABELS } from '@company/constants';
import type { Pool, PoolConnection } from 'mysql2/promise';
import type {
  BatchReverseStepReportsCommandResult,
  BatchReverseStepReportsPayload,
  BatchStepReportCommandResult,
  CorrectBatchStepReportCommandResult,
  CorrectBatchStepReportPayload,
  CreateBatchStepReportPayload,
  HistoricalBatchStepReportPayload,
  PageQuery,
  PageResult,
  BatchStepReportView,
  BatchStepReportDetail,
  BatchStepScrapRecordView,
  PreviewBatchReverseStepReportsPayload,
  ProductionBatchQuery,
  ProductionExecutionRecordGroup,
  ReverseBatchStepReportPayload,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { readProductionSnapshot } from './mysql-production-read-snapshot.js';
import { selectStepScrapPage } from './mysql-production-scrap.read.js';
import { ProductionReportingRepository } from '../application/ports/production-reporting.repository.js';
import {
  requireAbnormalOrigin,
  requireDirectReportQuantities,
  requireNormalReportCorrectionQuantity,
  requireReportWithinUpperLimit,
  type ProductionReportingAccess,
} from '../domain/production-reporting.policy.js';
import { integerQuantity } from '../domain/integer-quantity.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { selectExecutionBatchSummaries } from './mysql-production-reporting-batch.projection.js';
import {
  mapDisposition,
  mapQuantityProjection,
  mapReport,
  type ProjectionStepRow,
  type ReportRow,
} from './mysql-production-reporting.projection.js';
import { add, subtract } from './mysql-production-reporting-quantity.js';
import { invalidateUnapprovedCloseoutBasis } from './mysql-production-closeout-basis.js';
import {
  advanceReportingStepVersion,
  auditReporting,
  correctableReportReason,
  insertReportingDisposition,
  insertReportingFact,
  lockReportingContext,
  mapEligibleReport,
  normalOnlyReportReason,
  reportDependencies,
  requireReportingWrite,
  requireReportVersion,
  selectReportingDisposition,
  selectReportingFact,
  type ReportingContext,
  type ReportingPhase,
} from './mysql-production-reporting.persistence.js';
import {
  previewBulkReportReversal,
  requireBulkReportSelection,
  reverseBulkReportingFacts,
} from './mysql-production-reporting-bulk.js';

const MANAGE_EXECUTION_PERMISSION_LABEL =
  PRODUCTION_STEP_PERMISSION_LABELS[PERMISSIONS.production.steps.manageExecution];

@Injectable()
export class MysqlProductionReportingRepository extends ProductionReportingRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {
    super();
  }

  listExecutionBatches(query: ProductionBatchQuery) {
    return selectExecutionBatchSummaries(this.pool, query);
  }

  getBatchExecution(
    batchId: string,
    access: ProductionReportingAccess,
  ): Promise<ProductionExecutionRecordGroup> {
    return readProductionSnapshot(this.pool, (db) =>
      selectBatchExecutionRecords(db, batchId, access),
    );
  }
  listStepReports(
    batchId: string,
    stepRecordId: string,
    query: PageQuery,
    access: ProductionReportingAccess,
  ): Promise<PageResult<BatchStepReportView>> {
    return withTransaction(this.pool, (db) =>
      selectStepReportPage(db, batchId, stepRecordId, query, access),
    );
  }

  getStepReport(
    batchId: string,
    stepRecordId: string,
    reportId: string,
    access: ProductionReportingAccess,
  ): Promise<BatchStepReportDetail> {
    return withTransaction(this.pool, (db) =>
      selectStepReportDetail(db, batchId, stepRecordId, reportId, access),
    );
  }

  listStepScraps(
    batchId: string,
    stepRecordId: string,
    query: PageQuery,
    access: ProductionReportingAccess,
  ): Promise<PageResult<BatchStepScrapRecordView>> {
    return readProductionSnapshot(this.pool, (db) =>
      selectStepScrapPage(db, batchId, stepRecordId, query, access),
    );
  }

  createReport(
    batchId: string,
    stepRecordId: string,
    payload: CreateBatchStepReportPayload,
    context: CommandContext,
    access: ProductionReportingAccess,
  ) {
    return this.createFact(batchId, stepRecordId, payload, context, access, 'execution');
  }
  createHistoricalReport(
    batchId: string,
    stepRecordId: string,
    payload: HistoricalBatchStepReportPayload,
    context: CommandContext,
    access: ProductionReportingAccess,
  ) {
    return this.createFact(
      batchId,
      stepRecordId,
      {
        version: payload.version,
        normalQuantity: payload.normalQuantity,
        abnormalQuantity: 0,
        abnormalOrigin: null,
        remark: payload.reason,
      },
      context,
      access,
      'history',
    );
  }
  reverseReport(
    batchId: string,
    stepRecordId: string,
    reportId: string,
    payload: ReverseBatchStepReportPayload,
    context: CommandContext,
    access: ProductionReportingAccess,
  ) {
    return this.reverseFact(batchId, stepRecordId, reportId, payload, context, access, 'execution');
  }
  reverseHistoricalReport(
    batchId: string,
    stepRecordId: string,
    reportId: string,
    payload: ReverseBatchStepReportPayload,
    context: CommandContext,
    access: ProductionReportingAccess,
  ) {
    return this.reverseFact(batchId, stepRecordId, reportId, payload, context, access, 'history');
  }
  correctReport(
    batchId: string,
    stepRecordId: string,
    reportId: string,
    payload: CorrectBatchStepReportPayload,
    context: CommandContext,
    access: ProductionReportingAccess,
  ) {
    return this.correctFact(batchId, stepRecordId, reportId, payload, context, access, 'execution');
  }
  correctHistoricalReport(
    batchId: string,
    stepRecordId: string,
    reportId: string,
    payload: HistoricalBatchStepReportPayload,
    context: CommandContext,
    access: ProductionReportingAccess,
  ) {
    return this.correctFact(batchId, stepRecordId, reportId, payload, context, access, 'history');
  }

  previewBatchReverse(
    batchId: string,
    payload: PreviewBatchReverseStepReportsPayload,
    access: ProductionReportingAccess,
  ) {
    requireAdministrator(access);
    requireBulkReportSelection(payload.reports);
    return withTransaction(this.pool, async (db) => {
      const context = await lockReportingContext(db, batchId);
      const dependencies = await reportDependencies(
        db,
        payload.reports.map((item) => item.reportId),
        true,
      );
      return previewBulkReportReversal(context, payload.reports, dependencies);
    });
  }

  batchReverse(
    batchId: string,
    payload: BatchReverseStepReportsPayload,
    context: CommandContext,
    access: ProductionReportingAccess,
  ): Promise<BatchReverseStepReportsCommandResult> {
    requireAdministrator(access);
    requireBulkReportSelection(payload.reports);
    requireReason(payload.reason);
    return withTransaction(this.pool, (db) =>
      reverseBulkReportingFacts(db, batchId, payload, context),
    );
  }

  private createFact(
    batchId: string,
    stepRecordId: string,
    payload: CreateBatchStepReportPayload,
    context: CommandContext,
    access: ProductionReportingAccess,
    phase: ReportingPhase,
  ): Promise<BatchStepReportCommandResult> {
    return withTransaction(this.pool, async (db) => {
      const actorId = requireActor(context),
        locked = await lockReportingContext(db, batchId),
        step = requireStep(locked.steps, stepRecordId);
      requireReportingWrite(locked, step, access, phase, 'create');
      requireReportVersion(step, payload.version);
      requireDirectReportQuantities(payload.normalQuantity, payload.abnormalQuantity);
      if (phase === 'history') requireReason(payload.remark ?? '');
      const abnormalOrigin = requireAbnormalOrigin(
        payload.abnormalQuantity,
        payload.abnormalOrigin,
        locked.steps.indexOf(step) > 0,
      );
      requireReportWithinUpperLimit(
        step.effective_direct_reported,
        payload.normalQuantity,
        payload.abnormalQuantity,
        locked.quantities.get(stepRecordId)!.upperLimitQuantity,
      );
      const reportId = await insertReportingFact(db, {
        batchId,
        stepRecordId,
        reportType: 'normal',
        normalQuantity: payload.normalQuantity,
        abnormalQuantity: payload.abnormalQuantity,
        abnormalOrigin,
        unit: step.unit_snapshot,
        remark: payload.remark ?? null,
        actorId,
      });
      const dispositionId =
        payload.abnormalQuantity > 0
          ? await insertReportingDisposition(db, batchId, stepRecordId, reportId, actorId)
          : null;
      await advanceReportingStepVersion(db, step, actorId);
      await invalidateUnapprovedCloseoutBasis(db, batchId, actorId);
      await auditReporting(
        db,
        context,
        phase === 'history'
          ? 'production-step-report.history-create'
          : 'production-step-report.create',
        reportId,
        {
          batchId,
          stepRecordId,
          normalQuantity: String(payload.normalQuantity),
          abnormalQuantity: String(payload.abnormalQuantity),
          reason: payload.remark ?? null,
        },
      );
      return this.reportCommandResult(db, batchId, stepRecordId, reportId, dispositionId, access);
    });
  }

  private reverseFact(
    batchId: string,
    stepRecordId: string,
    reportId: string,
    payload: ReverseBatchStepReportPayload,
    context: CommandContext,
    access: ProductionReportingAccess,
    phase: ReportingPhase,
  ): Promise<BatchStepReportCommandResult> {
    requireReason(payload.reason);
    return withTransaction(this.pool, async (db) => {
      const actorId = requireActor(context),
        locked = await lockReportingContext(db, batchId),
        step = requireStep(locked.steps, stepRecordId);
      requireReportingWrite(locked, step, access, phase, 'correction');
      const target = requireTargetReport(locked, stepRecordId, reportId),
        dependencies = (await reportDependencies(db, [reportId], true)).get(reportId) ?? [];
      if (dependencies.length)
        throw new ProductionDomainError(
          'STEP_REPORT_DEPENDENCY_CONFLICT',
          correctableReportReason(target, dependencies, phase)!,
          { reportId, dependencies },
        );
      const normalOnlyReason = normalOnlyReportReason(target, phase);
      if (normalOnlyReason)
        throw new ProductionDomainError('STEP_REPORT_NOT_ALLOWED', normalOnlyReason);
      const existing = locked.reports.find((row) => String(row.reversal_of_report_id) === reportId);
      if (existing)
        return this.reportCommandResult(
          db,
          batchId,
          stepRecordId,
          String(existing.id),
          null,
          access,
        );
      requireCorrectable(target, dependencies, phase);
      requireReportVersion(step, payload.version);
      const reversalId = await insertReversal(db, target, payload.reason, actorId);
      await advanceReportingStepVersion(db, step, actorId);
      await invalidateUnapprovedCloseoutBasis(db, batchId, actorId);
      await auditReporting(
        db,
        context,
        phase === 'history'
          ? 'production-step-report.history-reverse'
          : 'production-step-report.reverse',
        reversalId,
        { batchId, stepRecordId, reversalOfReportId: reportId, reason: payload.reason },
      );
      return this.reportCommandResult(db, batchId, stepRecordId, reversalId, null, access);
    });
  }

  private correctFact(
    batchId: string,
    stepRecordId: string,
    reportId: string,
    payload: CorrectBatchStepReportPayload,
    context: CommandContext,
    access: ProductionReportingAccess,
    phase: ReportingPhase,
  ): Promise<CorrectBatchStepReportCommandResult> {
    requireReason(payload.reason);
    return withTransaction(this.pool, async (db) => {
      const actorId = requireActor(context),
        locked = await lockReportingContext(db, batchId),
        step = requireStep(locked.steps, stepRecordId);
      requireReportingWrite(locked, step, access, phase, 'correction');
      requireReportVersion(step, payload.version);
      requireNormalReportCorrectionQuantity(payload.normalQuantity);
      const target = requireTargetReport(locked, stepRecordId, reportId),
        dependencies = (await reportDependencies(db, [reportId], true)).get(reportId) ?? [];
      requireCorrectable(target, dependencies, phase);
      const correctedReported = add(
        subtract(step.effective_direct_reported, target.reported_quantity),
        payload.normalQuantity,
      );
      requireReportWithinUpperLimit(
        correctedReported,
        0,
        0,
        locked.quantities.get(stepRecordId)!.upperLimitQuantity,
      );
      const reversalId = await insertReversal(db, target, payload.reason, actorId);
      const replacementId = await insertReportingFact(db, {
        batchId,
        stepRecordId,
        reportType: 'normal',
        normalQuantity: payload.normalQuantity,
        abnormalQuantity: 0,
        abnormalOrigin: null,
        unit: target.unit_snapshot,
        remark: payload.reason,
        actorId,
        replacesReportId: reportId,
      });
      await advanceReportingStepVersion(db, step, actorId);
      await invalidateUnapprovedCloseoutBasis(db, batchId, actorId);
      await auditReporting(
        db,
        context,
        phase === 'history'
          ? 'production-step-report.history-correct'
          : 'production-step-report.correct',
        replacementId,
        {
          batchId,
          stepRecordId,
          correctionOfReportId: reportId,
          reversalReportId: reversalId,
          reason: payload.reason,
        },
      );
      const result = await this.reportCommandResult(
        db,
        batchId,
        stepRecordId,
        replacementId,
        null,
        access,
      );
      const { report, ...summary } = result;
      return {
        ...summary,
        reversal: mapReport(await selectReportingFact(db, reversalId)),
        replacement: report,
      };
    });
  }

  private async reportCommandResult(
    db: PoolConnection,
    batchId: string,
    stepRecordId: string,
    reportId: string,
    dispositionId: string | null,
    access: ProductionReportingAccess,
  ): Promise<BatchStepReportCommandResult> {
    const updated = await lockReportingContext(db, batchId),
      step = requireStep(updated.steps, stepRecordId),
      report = await selectReportingFact(db, reportId);
    const dependencies = (await reportDependencies(db, [reportId], true)).get(reportId) ?? [];
    return {
      ...commandSummary(updated, step),
      report: mapEligibleReport(
        report,
        step,
        updated.batch.status,
        updated.pendingApprovalId,
        access,
        dependencies,
      ),
      abnormalDisposition: dispositionId
        ? mapDisposition(await selectReportingDisposition(db, dispositionId))
        : null,
    };
  }
}

const requireActor = (context: CommandContext): string => {
  if (!context.actorId) throw new ProductionDomainError('INVALID_INPUT', '缺少当前操作人身份');
  return context.actorId;
};
const requireAdministrator = (access: ProductionReportingAccess): void => {
  if (!access.canManageExecution)
    throw new ProductionDomainError(
      'NOT_STEP_ASSIGNEE',
      `此操作需要「${MANAGE_EXECUTION_PERMISSION_LABEL}」权限`,
    );
};
const requireReason = (reason: string): void => {
  if (!reason.trim() || reason.length > 5000)
    throw new ProductionDomainError('INVALID_INPUT', '请填写不超过5000字的真实纠错原因');
};
const requireStep = (steps: ProjectionStepRow[], id: string): ProjectionStepRow => {
  const step = steps.find((row) => String(row.id) === id);
  if (!step) throw new ProductionDomainError('NOT_FOUND', '批次工序记录不存在');
  return step;
};
const requireTargetReport = (
  context: ReportingContext,
  stepRecordId: string,
  reportId: string,
): ReportRow => {
  const report = context.reports.find(
    (row) => String(row.id) === reportId && String(row.batch_step_record_id) === stepRecordId,
  );
  if (!report) throw new ProductionDomainError('NOT_FOUND', '当前任务工序下没有该报工事实');
  return report;
};
const requireCorrectable = (
  report: ReportRow,
  dependencies: Parameters<typeof correctableReportReason>[1],
  phase: ReportingPhase,
): void => {
  const reason = correctableReportReason(report, dependencies, phase);
  if (reason)
    throw new ProductionDomainError(
      dependencies.length
        ? 'STEP_REPORT_DEPENDENCY_CONFLICT'
        : !report.is_effective || report.report_type !== 'normal'
          ? 'STEP_REPORT_ALREADY_REVERSED'
          : 'STEP_REPORT_NOT_ALLOWED',
      reason,
      { reportId: String(report.id), dependencies },
    );
};
const insertReversal = (db: PoolConnection, target: ReportRow, reason: string, actorId: string) =>
  insertReportingFact(db, {
    batchId: String(target.production_batch_id),
    stepRecordId: String(target.batch_step_record_id),
    reportType: 'reversal',
    normalQuantity: integerQuantity(target.normal_quantity),
    abnormalQuantity: integerQuantity(target.abnormal_quantity),
    abnormalOrigin: target.abnormal_origin,
    unit: target.unit_snapshot,
    remark: reason,
    actorId,
    reversalOfReportId: String(target.id),
  });
const commandSummary = (context: ReportingContext, step: ProjectionStepRow) => ({
  productionBatchId: String(context.batch.id),
  stepRecordId: String(step.id),
  stepStatus: step.status,
  stepVersion: step.version,
  ...mapQuantityProjection(step, context.quantities.get(String(step.id))!),
});
