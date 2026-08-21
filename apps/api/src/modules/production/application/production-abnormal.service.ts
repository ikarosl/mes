import { Injectable } from '@nestjs/common';
import type {
  ApproveBatchStepReworkPayload,
  CompleteReworkPayload,
  RejectBatchStepAbnormalDispositionPayload,
  ReworkRecordItem,
} from '@company/contracts';
import type {
  CommandContext,
  IdempotentCommandContext,
} from '../../../common/audit/audit.types.js';
import { IdempotencyExecutor } from '../../../common/idempotency/idempotency-executor.js';
import { IdentityDirectoryService } from '../../identity/public.js';
import { COMPLETE_REWORK_IDEMPOTENCY_SCOPE } from './idempotency/production-idempotency-scopes.contract.js';
import { completeReworkResultCodec } from './idempotency/production-rework-result.codec.js';
import { ProductionAbnormalRepository } from './ports/production-abnormal.repository.js';

@Injectable()
export class ProductionAbnormalService {
  constructor(
    private readonly repository: ProductionAbnormalRepository,
    private readonly identity: IdentityDirectoryService,
    private readonly idempotency: IdempotencyExecutor,
  ) {}

  async listReworks(batchId: string): Promise<ReworkRecordItem[]> {
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

  private async enrich(rows: ReworkRecordItem[]): Promise<ReworkRecordItem[]> {
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
