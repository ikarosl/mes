import { Injectable } from '@nestjs/common';
import type {
  CorrectBatchStepReportPayload,
  CreateBatchStepReportPayload,
  ProductionExecutionRecordGroup,
} from '@company/contracts';
import type {
  CommandContext,
  IdempotentCommandContext,
} from '../../../common/audit/audit.types.js';
import { IdempotencyExecutor } from '../../../common/idempotency/idempotency-executor.js';
import { IdentityDirectoryService } from '../../identity/public.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { CORRECT_STEP_REPORT_IDEMPOTENCY_SCOPE } from './idempotency/correct-step-report-idempotency.contract.js';
import { CREATE_STEP_REPORT_IDEMPOTENCY_SCOPE } from './idempotency/create-step-report-idempotency.contract.js';
import {
  correctStepReportResultCodec,
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

  async getBatchExecution(batchId: string): Promise<ProductionExecutionRecordGroup> {
    return this.enrichGroup(await this.reporting.getBatchExecution(batchId));
  }

  async createReport(
    batchId: string,
    stepRecordId: string,
    payload: CreateBatchStepReportPayload,
    context: IdempotentCommandContext,
  ) {
    if (!context.actorId) throw new ProductionDomainError('NOT_STEP_ASSIGNEE', '缺少当前员工身份');
    const normalized = {
      version: payload.version,
      normalQuantity: payload.normalQuantity,
      abnormalQuantity: payload.abnormalQuantity,
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
        this.reporting.createReport(batchId, stepRecordId, normalized, {
          ...narrow(context),
          actorId: context.actorId,
        }),
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
  ) {
    return this.reporting.reverseReport(
      batchId,
      stepRecordId,
      reportId,
      { version, reason: reason.trim() },
      context,
    );
  }

  async correctReport(
    batchId: string,
    stepRecordId: string,
    reportId: string,
    payload: CorrectBatchStepReportPayload,
    context: IdempotentCommandContext,
  ) {
    const normalized = {
      version: payload.version,
      normalQuantity: payload.normalQuantity,
      abnormalQuantity: payload.abnormalQuantity,
      reason: payload.reason.trim(),
    };
    const execution = await this.idempotency.execute({
      scope: CORRECT_STEP_REPORT_IDEMPOTENCY_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { batchId, stepRecordId, reportId }, body: normalized },
      resultCodec: correctStepReportResultCodec,
      handler: () =>
        this.reporting.correctReport(batchId, stepRecordId, reportId, normalized, narrow(context)),
    });
    return execution.result;
  }

  private async enrichGroup(group: ProductionExecutionRecordGroup) {
    const ids = [
      ...new Set(
        group.steps.flatMap((step) => [
          ...(step.responsibleUserId ? [step.responsibleUserId] : []),
          ...step.reports.map((report) => report.createdById),
        ]),
      ),
    ];
    const users = await this.identity.listUserReferencesByIds(ids);
    const names = new Map(users.map((user) => [user.id, user.displayName]));
    return {
      ...group,
      steps: group.steps.map((step) => ({
        ...step,
        responsibleUserName: step.responsibleUserId
          ? (names.get(step.responsibleUserId) ?? null)
          : null,
        reports: step.reports.map((report) => ({
          ...report,
          createdByName: names.get(report.createdById) ?? null,
        })),
      })),
    };
  }
}

const narrow = (context: IdempotentCommandContext): CommandContext => ({
  actorId: context.actorId,
  requestId: context.requestId,
  ip: context.ip,
  userAgent: context.userAgent,
});
