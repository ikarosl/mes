import { Injectable } from '@nestjs/common';
import type {
  ReopenProductionStepPayload,
  ProductionStepCommandResult,
  PageResult,
  ProductionStepExecutionHistoryItem,
  StartProductionExecutionPayload,
  CompleteProductionExecutionPayload,
} from '@company/contracts';
import type {
  CommandContext,
  IdempotentCommandContext,
} from '../../../common/audit/audit.types.js';
import { IdempotencyExecutor } from '../../../common/idempotency/idempotency-executor.js';
import { IdentityDirectoryService } from '../../identity/public.js';
import { TechnicalFileContentQuery } from '../../product/public.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { ProductionExecutionRepository } from './ports/production-execution.repository.js';
import {
  START_PRODUCTION_EXECUTION_SCOPE,
  COMPLETE_PRODUCTION_EXECUTION_SCOPE,
  COMPLETE_RESEARCH_EXECUTION_SCOPE,
} from './idempotency/production-idempotency-scopes.contract.js';
import {
  productionExecutionStartResultCodec,
  productionExecutionCompletionResultCodec,
} from './idempotency/production-execution-result.codec.js';

@Injectable()
export class ProductionExecutionService {
  constructor(
    private readonly execution: ProductionExecutionRepository,
    private readonly identity: IdentityDirectoryService,
    private readonly technicalFileContent: TechnicalFileContentQuery,
    private readonly idempotency: IdempotencyExecutor,
  ) {}

  getCompletionCheck(batchId: string) {
    return this.execution.getCompletionCheck(batchId);
  }

  getStartCheck(batchId: string) {
    return this.execution.getStartCheck(batchId);
  }

  async startExecution(
    batchId: string,
    payload: StartProductionExecutionPayload,
    context: IdempotentCommandContext,
  ) {
    const body = { version: payload.version, reason: payload.reason?.trim() || null };
    const execution = await this.idempotency.execute({
      scope: START_PRODUCTION_EXECUTION_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { batchId }, body },
      resultCodec: productionExecutionStartResultCodec,
      handler: () => this.execution.startExecution(batchId, body, commandContext(context)),
    });
    return execution.result;
  }

  async completeResearchExecution(
    batchId: string,
    payload: CompleteProductionExecutionPayload,
    context: IdempotentCommandContext,
  ) {
    const execution = await this.idempotency.execute({
      scope: COMPLETE_RESEARCH_EXECUTION_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { batchId }, body: { ...payload } },
      resultCodec: productionExecutionCompletionResultCodec,
      handler: () =>
        this.execution.completeResearchExecution(batchId, payload, commandContext(context)),
    });
    return execution.result;
  }

  async completeExecution(
    batchId: string,
    payload: CompleteProductionExecutionPayload,
    context: IdempotentCommandContext,
  ) {
    const execution = await this.idempotency.execute({
      scope: COMPLETE_PRODUCTION_EXECUTION_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { batchId }, body: { ...payload } },
      resultCodec: productionExecutionCompletionResultCodec,
      handler: () => this.execution.completeExecution(batchId, payload, commandContext(context)),
    });
    return execution.result;
  }

  listMyTasks(context: CommandContext, query: { page: number; pageSize: number }) {
    if (!context.actorId) throw new ProductionDomainError('NOT_STEP_ASSIGNEE', '缺少当前员工身份');
    return this.execution.listWorkerTasks(context.actorId, query);
  }

  getStepSopContent(batchId: string, stepRecordId: string) {
    return this.loadStepSopContent(batchId, stepRecordId);
  }

  getMyStepSopContent(batchId: string, stepRecordId: string, context: CommandContext) {
    if (!context.actorId) throw new ProductionDomainError('NOT_STEP_ASSIGNEE', '缺少当前员工身份');
    return this.loadStepSopContent(batchId, stepRecordId, context.actorId);
  }

  async assignStep(
    batchId: string,
    stepRecordId: string,
    responsibleUserId: string,
    version: number,
    context: CommandContext,
  ) {
    await this.requireActiveUser(responsibleUserId);
    return this.execution.assignStep(batchId, stepRecordId, responsibleUserId, version, context);
  }

  unassignStep(batchId: string, stepRecordId: string, version: number, context: CommandContext) {
    return this.execution.unassignStep(batchId, stepRecordId, version, context);
  }

  async reassignStep(
    batchId: string,
    stepRecordId: string,
    responsibleUserId: string,
    version: number,
    context: CommandContext,
  ) {
    await this.requireActiveUser(responsibleUserId);
    return this.execution.reassignStep(batchId, stepRecordId, responsibleUserId, version, context);
  }

  startStep(
    batchId: string,
    stepRecordId: string,
    version: number,
    context: CommandContext,
    asAdministrator = false,
  ) {
    if (!context.actorId) throw new ProductionDomainError('NOT_STEP_ASSIGNEE', '缺少当前员工身份');
    return this.execution.startStep(
      batchId,
      stepRecordId,
      version,
      {
        ...context,
        actorId: context.actorId,
      },
      asAdministrator,
    );
  }

  completeStep(
    batchId: string,
    stepRecordId: string,
    version: number,
    context: CommandContext,
    asAdministrator = false,
  ): Promise<ProductionStepCommandResult> {
    return this.execution.completeStep(
      batchId,
      stepRecordId,
      version,
      requireActor(context),
      asAdministrator,
    );
  }

  reopenStep(
    batchId: string,
    stepRecordId: string,
    payload: ReopenProductionStepPayload,
    context: CommandContext,
    asAdministrator = false,
  ): Promise<ProductionStepCommandResult> {
    return this.execution.reopenStep(
      batchId,
      stepRecordId,
      { version: payload.version, reason: payload.reason.trim() },
      requireActor(context),
      asAdministrator,
    );
  }

  async listStepExecutionHistory(
    batchId: string,
    stepRecordId: string,
    query: { page: number; pageSize: number },
    context?: CommandContext,
  ): Promise<PageResult<ProductionStepExecutionHistoryItem>> {
    const history = await this.execution.listStepExecutionHistory(
      batchId,
      stepRecordId,
      query,
      context ? requireActor(context).actorId : undefined,
    );
    const users = await this.identity.listUserReferencesByIds([
      ...new Set(history.items.map((item) => item.createdById)),
    ]);
    const names = new Map(users.map((user) => [user.id, user.displayName]));
    return {
      ...history,
      items: history.items.map((item) => ({
        ...item,
        createdByName: names.get(item.createdById) ?? null,
      })),
    };
  }

  private async requireActiveUser(userId: string): Promise<void> {
    const users = await this.identity.listActiveUserOptionsByIds([userId]);
    if (users.length !== 1)
      throw new ProductionDomainError('INVALID_INPUT', '派工员工不存在或已停用');
  }

  private async loadStepSopContent(
    batchId: string,
    stepRecordId: string,
    responsibleUserId?: string,
  ) {
    const file = await this.execution.getStepSopSnapshot(batchId, stepRecordId, responsibleUserId);
    try {
      const content = await this.technicalFileContent.readHistoricalSnapshot(file);
      return {
        file: { ...file, mimeType: content.mimeType, sizeBytes: content.sizeBytes },
        stream: content.stream,
      };
    } catch {
      throw new ProductionDomainError('SOP_SNAPSHOT_UNAVAILABLE', '历史 SOP 文件暂时无法读取');
    }
  }
}

const commandContext = ({
  actorId,
  requestId,
  ip,
  userAgent,
}: IdempotentCommandContext): CommandContext => ({ actorId, requestId, ip, userAgent });

const requireActor = (context: CommandContext): CommandContext & { actorId: string } => {
  if (!context.actorId) throw new ProductionDomainError('NOT_STEP_ASSIGNEE', '缺少当前操作人身份');
  return { ...context, actorId: context.actorId };
};
