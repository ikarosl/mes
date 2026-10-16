import { Injectable } from '@nestjs/common';
import type {
  AcceptProcessInspectionPayload,
  ApproveBatchStepReworkPayload,
  CompleteReworkPayload,
  PageQuery,
  PageResult,
  ProcessInspectionDispositionHistoryItem,
  ProcessInspectionEntry,
  RejectBatchStepAbnormalDispositionPayload,
  ReworkRecordItem,
  ReworkRecordView,
} from '@company/contracts';
import type {
  CommandContext,
  IdempotentCommandContext,
} from '../../../common/audit/audit.types.js';
import { IdempotencyExecutor } from '../../../common/idempotency/idempotency-executor.js';
import { IdentityDirectoryService } from '../../identity/public.js';
import { QualityProcessInspectionQuery } from '../../quality/public.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { acceptProcessInspectionResultCodec } from './idempotency/production-reporting-result.codec.js';
import {
  ACCEPT_PROCESS_INSPECTION_SCOPE,
  COMPLETE_REWORK_IDEMPOTENCY_SCOPE,
} from './idempotency/production-idempotency-scopes.contract.js';
import { completeReworkResultCodec } from './idempotency/production-rework-result.codec.js';
import { ProductionAbnormalRepository } from './ports/production-abnormal.repository.js';

@Injectable()
export class ProductionAbnormalService {
  constructor(
    private readonly repository: ProductionAbnormalRepository,
    private readonly identity: IdentityDirectoryService,
    private readonly idempotency: IdempotencyExecutor,
    private readonly processInspections: QualityProcessInspectionQuery,
  ) {}

  async listPendingInspections(
    batchId: string,
    stepId: string,
    query: PageQuery,
  ): Promise<PageResult<ProcessInspectionEntry>> {
    await this.repository.requireInspectionStep(batchId, stepId);
    return this.processInspections.listPendingForStep({ batchId, stepId }, query);
  }

  async getInspection(
    batchId: string,
    stepId: string,
    inspectionId: string,
  ): Promise<ProcessInspectionEntry> {
    await this.repository.requireInspectionStep(batchId, stepId);
    const result = await this.processInspections.getForStep({ batchId, stepId }, inspectionId);
    if (!result) throw new ProductionDomainError('NOT_FOUND', '当前任务工序的专检记录不存在');
    return result;
  }

  async listInspectionDispositions(
    batchId: string,
    stepId: string,
    query: PageQuery,
  ): Promise<PageResult<ProcessInspectionDispositionHistoryItem>> {
    const result = await this.repository.listInspectionDispositions(batchId, stepId, query);
    const userIds = result.items.flatMap((row) => [
      row.createdBy,
      ...(row.reviewedBy ? [row.reviewedBy] : []),
      ...(row.rework ? [row.rework.responsibleUserId] : []),
    ]);
    const users = await this.identity.listUserReferencesByIds([...new Set(userIds)]);
    const names = new Map(users.map((user) => [user.id, user.displayName]));
    return {
      ...result,
      items: result.items.map((row) => ({
        ...row,
        createdByName: names.get(row.createdBy) ?? null,
        reviewedByName: row.reviewedBy ? (names.get(row.reviewedBy) ?? null) : null,
        rework: row.rework
          ? {
              ...row.rework,
              responsibleUserName: names.get(row.rework.responsibleUserId) ?? null,
            }
          : null,
      })),
    };
  }

  async acceptInspection(
    batchId: string,
    stepId: string,
    payload: AcceptProcessInspectionPayload,
    context: IdempotentCommandContext,
  ) {
    const normalized = {
      inspectionId: payload.inspectionId,
      recordId: payload.recordId,
      version: payload.version,
      quantity: payload.quantity,
      remark: payload.remark?.trim() || null,
    };
    const execution = await this.idempotency.execute({
      scope: ACCEPT_PROCESS_INSPECTION_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { batchId, stepId }, body: normalized },
      resultCodec: acceptProcessInspectionResultCodec,
      handler: () => this.repository.acceptInspection(batchId, stepId, normalized, narrow(context)),
    });
    return execution.result;
  }

  async listReworks(batchId: string): Promise<ReworkRecordView[]> {
    return this.enrich(await this.repository.listReworks(batchId));
  }

  async approveRework(
    dispositionId: string,
    payload: ApproveBatchStepReworkPayload,
    context: CommandContext,
  ): Promise<ReworkRecordItem> {
    return this.enrichOne(
      await this.repository.approveRework(
        dispositionId,
        { version: payload.version, remark: payload.remark?.trim() || null },
        context,
      ),
    );
  }

  rejectDisposition(
    dispositionId: string,
    payload: RejectBatchStepAbnormalDispositionPayload,
    context: CommandContext,
  ) {
    return this.repository.rejectDisposition(
      dispositionId,
      { version: payload.version, reason: payload.reason.trim() },
      context,
    );
  }

  async startRework(reworkId: string, version: number, context: CommandContext) {
    return this.enrichOne(await this.repository.startRework(reworkId, version, context));
  }

  async completeRework(
    reworkId: string,
    payload: CompleteReworkPayload,
    context: IdempotentCommandContext,
  ) {
    const normalized = {
      version: payload.version,
      normalQuantity: payload.normalQuantity,
      abnormalQuantity: payload.abnormalQuantity,
      remark: payload.remark?.trim() || null,
    };
    const execution = await this.idempotency.execute({
      scope: COMPLETE_REWORK_IDEMPOTENCY_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { reworkId }, body: normalized },
      resultCodec: completeReworkResultCodec,
      handler: async () => {
        const result = await this.repository.completeRework(reworkId, normalized, narrow(context));
        return { ...result, rework: await this.enrichOne(result.rework) };
      },
    });
    return execution.result;
  }

  private async enrich<T extends ReworkRecordItem>(rows: T[]): Promise<T[]> {
    const users = await this.identity.listUserReferencesByIds([
      ...new Set(rows.map((row) => row.responsibleUserId)),
    ]);
    const names = new Map(users.map((user) => [user.id, user.displayName]));
    return rows.map((row) => ({
      ...row,
      responsibleUserName: names.get(row.responsibleUserId) ?? null,
    }));
  }

  private async enrichOne(row: ReworkRecordItem): Promise<ReworkRecordItem> {
    return (await this.enrich([row]))[0]!;
  }
}

const narrow = (context: IdempotentCommandContext): CommandContext => ({
  actorId: context.actorId,
  requestId: context.requestId,
  ip: context.ip,
  userAgent: context.userAgent,
});
