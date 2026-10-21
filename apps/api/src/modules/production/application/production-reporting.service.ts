import { Injectable } from '@nestjs/common';
import type {
  BatchReverseStepReportsPayload,
  BatchStepReportDetail,
  BatchStepReportView,
  BatchStepScrapRecordView,
  CorrectBatchStepReportPayload,
  CreateBatchStepReportPayload,
  HistoricalBatchStepReportPayload,
  PageQuery,
  PageResult,
  PreviewBatchReverseStepReportsPayload,
  ProductionBatchQuery,
  ProductionExecutionRecordGroup,
} from '@company/contracts';
import type {
  CommandContext,
  IdempotentCommandContext,
} from '../../../common/audit/audit.types.js';
import { IdempotencyExecutor } from '../../../common/idempotency/idempotency-executor.js';
import { IdentityDirectoryService } from '../../identity/public.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import type { ProductionReportingAccess } from '../domain/production-reporting.policy.js';
import {
  BATCH_REVERSE_STEP_REPORTS_SCOPE,
  CORRECT_HISTORICAL_STEP_REPORT_SCOPE,
  CORRECT_STEP_REPORT_IDEMPOTENCY_SCOPE,
  CREATE_HISTORICAL_STEP_REPORT_SCOPE,
  CREATE_STEP_REPORT_IDEMPOTENCY_SCOPE,
} from './idempotency/production-idempotency-scopes.contract.js';
import {
  batchReverseStepReportsResultCodec,
  correctHistoricalStepReportResultCodec,
  correctStepReportResultCodec,
  createHistoricalStepReportResultCodec,
  createStepReportResultCodec,
} from './idempotency/production-reporting-result.codec.js';
import { ProductionReportingRepository } from './ports/production-reporting.repository.js';

@Injectable()
export class ProductionReportingService {
  constructor(
    private readonly reporting: ProductionReportingRepository,
    private readonly identity: IdentityDirectoryService,
    private readonly idempotency: IdempotencyExecutor,
  ) {}

  listExecutionBatches(query: ProductionBatchQuery) {
    return this.reporting.listExecutionBatches(query);
  }

  async getBatchExecution(
    batchId: string,
    access: ProductionReportingAccess,
  ): Promise<ProductionExecutionRecordGroup> {
    const group = await this.reporting.getBatchExecution(batchId, access);
    const ids = [
      ...new Set(
        group.steps.flatMap((step) => (step.responsibleUserId ? [step.responsibleUserId] : [])),
      ),
    ];
    const names = new Map(
      (await this.identity.listUserReferencesByIds(ids)).map((user) => [user.id, user.displayName]),
    );
    return {
      ...group,
      steps: group.steps.map((step) => ({
        ...step,
        responsibleUserName: step.responsibleUserId
          ? (names.get(step.responsibleUserId) ?? null)
          : null,
      })),
    };
  }

  async listStepScraps(
    batchId: string,
    stepRecordId: string,
    query: PageQuery,
    access: ProductionReportingAccess,
  ): Promise<PageResult<BatchStepScrapRecordView>> {
    const result = await this.reporting.listStepScraps(batchId, stepRecordId, query, access);
    const ids = [
      ...new Set(
        result.items.flatMap((item) => [
          item.createdBy,
          ...(item.reproductionAuthorization ? [item.reproductionAuthorization.authorizedBy] : []),
        ]),
      ),
    ];
    const names = new Map(
      (await this.identity.listUserReferencesByIds(ids)).map((user) => [user.id, user.displayName]),
    );
    return {
      ...result,
      items: result.items.map((item) => ({
        ...item,
        createdByName: names.get(item.createdBy) ?? null,
        reproductionAuthorization: item.reproductionAuthorization
          ? {
              ...item.reproductionAuthorization,
              authorizedByName: names.get(item.reproductionAuthorization.authorizedBy) ?? null,
            }
          : null,
      })),
    };
  }

  async listStepReports(
    batchId: string,
    stepRecordId: string,
    query: PageQuery,
    access: ProductionReportingAccess,
  ): Promise<PageResult<BatchStepReportView>> {
    const result = await this.reporting.listStepReports(batchId, stepRecordId, query, access);
    const names = new Map(
      (
        await this.identity.listUserReferencesByIds([
          ...new Set(
            result.items.flatMap((item) => [
              item.createdById,
              ...(item.reworkOrigin ? [item.reworkOrigin.responsibleUserId] : []),
            ]),
          ),
        ])
      ).map((user) => [user.id, user.displayName]),
    );
    return {
      ...result,
      items: result.items.map((item) => ({
        ...item,
        createdByName: names.get(item.createdById) ?? null,
        reworkOrigin: item.reworkOrigin
          ? {
              ...item.reworkOrigin,
              responsibleUserName: names.get(item.reworkOrigin.responsibleUserId) ?? null,
            }
          : null,
      })),
    };
  }

  async getStepReport(
    batchId: string,
    stepRecordId: string,
    reportId: string,
    access: ProductionReportingAccess,
  ): Promise<BatchStepReportDetail> {
    const detail = await this.reporting.getStepReport(batchId, stepRecordId, reportId, access);
    const reworks = detail.processingChain.flatMap((item) => (item.rework ? [item.rework] : []));
    const names = new Map(
      (
        await this.identity.listUserReferencesByIds([
          ...new Set([
            detail.createdById,
            ...reworks.map((rework) => rework.responsibleUserId),
            ...(detail.reworkOrigin ? [detail.reworkOrigin.responsibleUserId] : []),
          ]),
        ])
      ).map((user) => [user.id, user.displayName]),
    );
    return {
      ...detail,
      createdByName: names.get(detail.createdById) ?? null,
      reworkOrigin: detail.reworkOrigin
        ? {
            ...detail.reworkOrigin,
            responsibleUserName: names.get(detail.reworkOrigin.responsibleUserId) ?? null,
          }
        : null,
      processingChain: detail.processingChain.map((item) => ({
        ...item,
        rework: item.rework
          ? {
              ...item.rework,
              responsibleUserName: names.get(item.rework.responsibleUserId) ?? null,
            }
          : null,
      })),
    };
  }

  async createReport(
    batchId: string,
    stepRecordId: string,
    payload: CreateBatchStepReportPayload,
    context: IdempotentCommandContext,
    access: ProductionReportingAccess,
  ) {
    const normalized = {
      version: payload.version,
      normalQuantity: payload.normalQuantity,
      abnormalQuantity: payload.abnormalQuantity,
      abnormalOrigin: payload.abnormalOrigin ?? null,
      remark: payload.remark?.trim() || null,
    };
    const execution = await this.idempotency.execute({
      scope: CREATE_STEP_REPORT_IDEMPOTENCY_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { batchId, stepRecordId }, body: normalized },
      resultCodec: createStepReportResultCodec,
      handler: () =>
        this.reporting.createReport(batchId, stepRecordId, normalized, narrow(context), access),
    });
    return execution.result;
  }

  reverseReport(
    batchId: string,
    stepRecordId: string,
    reportId: string,
    version: number,
    reason: string,
    context: CommandContext,
    access: ProductionReportingAccess,
  ) {
    return this.reporting.reverseReport(
      batchId,
      stepRecordId,
      reportId,
      { version, reason: normalizeReason(reason) },
      context,
      access,
    );
  }

  async correctReport(
    batchId: string,
    stepRecordId: string,
    reportId: string,
    payload: CorrectBatchStepReportPayload,
    context: IdempotentCommandContext,
    access: ProductionReportingAccess,
  ) {
    const normalized = {
      version: payload.version,
      normalQuantity: payload.normalQuantity,
      reason: normalizeReason(payload.reason),
    };
    const execution = await this.idempotency.execute({
      scope: CORRECT_STEP_REPORT_IDEMPOTENCY_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { batchId, stepRecordId, reportId }, body: normalized },
      resultCodec: correctStepReportResultCodec,
      handler: () =>
        this.reporting.correctReport(
          batchId,
          stepRecordId,
          reportId,
          normalized,
          narrow(context),
          access,
        ),
    });
    return execution.result;
  }

  async createHistoricalReport(
    batchId: string,
    stepRecordId: string,
    payload: HistoricalBatchStepReportPayload,
    context: IdempotentCommandContext,
    access: ProductionReportingAccess,
  ) {
    const normalized = {
      version: payload.version,
      normalQuantity: payload.normalQuantity,
      reason: normalizeReason(payload.reason),
    };
    const execution = await this.idempotency.execute({
      scope: CREATE_HISTORICAL_STEP_REPORT_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { batchId, stepRecordId }, body: normalized },
      resultCodec: createHistoricalStepReportResultCodec,
      handler: () =>
        this.reporting.createHistoricalReport(
          batchId,
          stepRecordId,
          normalized,
          narrow(context),
          access,
        ),
    });
    return execution.result;
  }

  reverseHistoricalReport(
    batchId: string,
    stepRecordId: string,
    reportId: string,
    version: number,
    reason: string,
    context: CommandContext,
    access: ProductionReportingAccess,
  ) {
    return this.reporting.reverseHistoricalReport(
      batchId,
      stepRecordId,
      reportId,
      { version, reason: normalizeReason(reason) },
      context,
      access,
    );
  }

  async correctHistoricalReport(
    batchId: string,
    stepRecordId: string,
    reportId: string,
    payload: HistoricalBatchStepReportPayload,
    context: IdempotentCommandContext,
    access: ProductionReportingAccess,
  ) {
    const normalized = {
      version: payload.version,
      normalQuantity: payload.normalQuantity,
      reason: normalizeReason(payload.reason),
    };
    const execution = await this.idempotency.execute({
      scope: CORRECT_HISTORICAL_STEP_REPORT_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { batchId, stepRecordId, reportId }, body: normalized },
      resultCodec: correctHistoricalStepReportResultCodec,
      handler: () =>
        this.reporting.correctHistoricalReport(
          batchId,
          stepRecordId,
          reportId,
          normalized,
          narrow(context),
          access,
        ),
    });
    return execution.result;
  }

  previewBatchReverse(
    batchId: string,
    payload: PreviewBatchReverseStepReportsPayload,
    access: ProductionReportingAccess,
  ) {
    return this.reporting.previewBatchReverse(
      batchId,
      { reports: normalizeReports(payload) },
      access,
    );
  }

  async batchReverse(
    batchId: string,
    payload: BatchReverseStepReportsPayload,
    context: IdempotentCommandContext,
    access: ProductionReportingAccess,
  ) {
    const normalized = {
      reports: normalizeReports(payload),
      reason: normalizeReason(payload.reason),
      previewToken: payload.previewToken,
    };
    const execution = await this.idempotency.execute({
      scope: BATCH_REVERSE_STEP_REPORTS_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { batchId }, body: normalized },
      resultCodec: batchReverseStepReportsResultCodec,
      handler: () => this.reporting.batchReverse(batchId, normalized, narrow(context), access),
    });
    return execution.result;
  }
}

const normalizeReports = (payload: PreviewBatchReverseStepReportsPayload) =>
  payload.reports.map((item) => ({
    reportId: item.reportId,
    stepRecordId: item.stepRecordId,
    version: item.version,
  }));
const normalizeReason = (reason: string): string => {
  const normalized = reason.trim();
  if (!normalized || normalized.length > 5000)
    throw new ProductionDomainError('INVALID_INPUT', '请填写不超过5000字的纠错原因');
  return normalized;
};
const narrow = (context: IdempotentCommandContext): CommandContext => ({
  actorId: context.actorId,
  requestId: context.requestId,
  ip: context.ip,
  userAgent: context.userAgent,
});
