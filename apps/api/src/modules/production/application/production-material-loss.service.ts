import { Injectable } from '@nestjs/common';
import type {
  CreateMaterialLossPayload,
  MaterialLossBatchOption,
  MaterialLossCandidateItem,
  MaterialLossItem,
  MaterialLossQuery,
  PageResult,
} from '@company/contracts';
import type {
  CommandContext,
  IdempotentCommandContext,
} from '../../../common/audit/audit.types.js';
import { IdempotencyExecutor } from '../../../common/idempotency/idempotency-executor.js';
import { IdentityDirectoryService } from '../../identity/public.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import {
  CONFIRM_MATERIAL_LOSS_IDEMPOTENCY_SCOPE,
  CREATE_MATERIAL_LOSS_IDEMPOTENCY_SCOPE,
} from './idempotency/production-idempotency-scopes.contract.js';
import {
  confirmMaterialLossResultCodec,
  createMaterialLossResultCodec,
} from './idempotency/production-material-loss-result.codec.js';
import { ProductionMaterialLossRepository } from './ports/production-material-loss.repository.js';

@Injectable()
export class ProductionMaterialLossService {
  constructor(
    private readonly materialLosses: ProductionMaterialLossRepository,
    private readonly identity: IdentityDirectoryService,
    private readonly idempotency: IdempotencyExecutor,
  ) {}

  async listMaterialLosses(query: MaterialLossQuery): Promise<PageResult<MaterialLossItem>> {
    const result = await this.materialLosses.listMaterialLosses(query);
    return { ...result, items: await this.enrichMaterialLosses(result.items) };
  }
  async getMaterialLoss(scrapId: string): Promise<MaterialLossItem> {
    return (
      await this.enrichMaterialLosses([await this.materialLosses.getMaterialLoss(scrapId)])
    )[0]!;
  }
  listMaterialLossBatchOptions(): Promise<MaterialLossBatchOption[]> {
    return this.materialLosses.listMaterialLossBatchOptions();
  }
  listMaterialLossCandidates(batchId: string): Promise<MaterialLossCandidateItem[]> {
    return this.materialLosses.listMaterialLossCandidates(batchId);
  }
  async createMaterialLoss(
    payload: CreateMaterialLossPayload,
    context: IdempotentCommandContext,
  ): Promise<MaterialLossItem> {
    const reasonType = payload.reasonType.trim();
    if (!reasonType) throw new ProductionDomainError('INVALID_INPUT', '损耗原因不能为空');
    const normalized = { ...payload, reasonType, remark: clean(payload.remark) };
    const execution = await this.idempotency.execute({
      scope: CREATE_MATERIAL_LOSS_IDEMPOTENCY_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { body: normalized },
      resultCodec: createMaterialLossResultCodec,
      handler: async () => {
        const item = await this.materialLosses.createMaterialLoss(
          normalized,
          toCommandContext(context),
        );
        return (await this.enrichMaterialLosses([item]))[0]!;
      },
    });
    return execution.result;
  }
  async confirmMaterialLoss(
    scrapId: string,
    version: number,
    context: IdempotentCommandContext,
  ): Promise<MaterialLossItem> {
    const execution = await this.idempotency.execute({
      scope: CONFIRM_MATERIAL_LOSS_IDEMPOTENCY_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { scrapId }, body: { version } },
      resultCodec: confirmMaterialLossResultCodec,
      handler: async () => {
        const item = await this.materialLosses.confirmMaterialLoss(
          scrapId,
          version,
          toCommandContext(context),
        );
        return (await this.enrichMaterialLosses([item]))[0]!;
      },
    });
    return execution.result;
  }
  async cancelMaterialLoss(
    scrapId: string,
    version: number,
    reason: string,
    context: CommandContext,
  ): Promise<MaterialLossItem> {
    const item = await this.materialLosses.cancelMaterialLoss(
      scrapId,
      version,
      requireReason(reason),
      context,
    );
    return (await this.enrichMaterialLosses([item]))[0]!;
  }

  private async enrichMaterialLosses(items: MaterialLossItem[]): Promise<MaterialLossItem[]> {
    const names = await this.userNames(
      items.flatMap((item) => [item.confirmedById, item.createdById, item.cancelledById]),
    );
    return items.map((item) => ({
      ...item,
      confirmedByName: item.confirmedById ? (names.get(item.confirmedById) ?? null) : null,
      createdByName: names.get(item.createdById) ?? null,
      cancelledByName: item.cancelledById ? (names.get(item.cancelledById) ?? null) : null,
    }));
  }
  private async userNames(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    const users = await this.identity.listUserReferencesByIds(unique);
    return new Map(users.map((user) => [user.id, user.displayName]));
  }
}

const clean = (value: string | null | undefined): string | null => value?.trim() || null;
const toCommandContext = (context: CommandContext): CommandContext => ({
  actorId: context.actorId,
  requestId: context.requestId,
  ip: context.ip,
  userAgent: context.userAgent,
});
const requireReason = (value: string): string => {
  const reason = clean(value);
  if (!reason) throw new ProductionDomainError('INVALID_INPUT', '取消原因不能为空');
  return reason;
};
