import { Injectable } from '@nestjs/common';
import type {
  CreateMaterialOutboundPayload,
  MaterialOutboundItem,
  MaterialOutboundQuery,
} from '@company/contracts';
import { normalizeMaterialOutboundPayload } from '@company/utils';
import type {
  CommandContext,
  IdempotentCommandContext,
} from '../../../common/audit/audit.types.js';
import { IdempotencyExecutor } from '../../../common/idempotency/idempotency-executor.js';
import { IdentityDirectoryService } from '../../identity/public.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { CREATE_MATERIAL_OUTBOUND_IDEMPOTENCY_SCOPE } from './idempotency/production-idempotency-scopes.contract.js';
import { CONFIRM_MATERIAL_OUTBOUND_IDEMPOTENCY_SCOPE } from './idempotency/production-idempotency-scopes.contract.js';
import {
  materialOutboundResultCodec,
  confirmMaterialOutboundResultCodec,
} from './idempotency/production-material-result.codec.js';
import { ProductionMaterialOutboundRepository } from './ports/production-material-outbound.repository.js';

@Injectable()
export class ProductionMaterialOutboundService {
  constructor(
    private readonly outbounds: ProductionMaterialOutboundRepository,
    private readonly identity: IdentityDirectoryService,
    private readonly idempotency: IdempotencyExecutor,
  ) {}

  async createOutbound(
    batchId: string,
    payload: CreateMaterialOutboundPayload,
    context: IdempotentCommandContext,
  ) {
    const normalized = normalizeMaterialOutboundPayload(payload);
    const commandContext = narrow(context);
    const execution = await this.idempotency.execute({
      scope: CREATE_MATERIAL_OUTBOUND_IDEMPOTENCY_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { batchId }, body: normalized },
      resultCodec: materialOutboundResultCodec,
      handler: async () => {
        const result = await this.outbounds.createOutbound(batchId, normalized, commandContext);
        return { ...result, outbound: await this.enrichOutbound(result.outbound) };
      },
    });
    return execution.result;
  }
  async listOutbounds(batchId: string) {
    return this.enrichOutbounds(await this.outbounds.listOutbounds(batchId));
  }
  async listOutboundOrders(query: MaterialOutboundQuery) {
    const result = await this.outbounds.listOutboundOrders(query);
    return {
      ...result,
      items: await this.enrichOutbounds(result.items),
    };
  }
  async getOutbound(outboundId: string) {
    return this.enrichOutbound(await this.outbounds.getOutbound(outboundId));
  }
  listOutboundBatchOptions() {
    return this.outbounds.listOutboundBatchOptions();
  }
  listOutboundCandidates(batchId: string) {
    return this.outbounds.listOutboundCandidates(batchId);
  }
  async confirmOutbound(outboundId: string, version: number, context: IdempotentCommandContext) {
    const commandContext = narrow(context);
    const execution = await this.idempotency.execute({
      scope: CONFIRM_MATERIAL_OUTBOUND_IDEMPOTENCY_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { outboundId }, body: { version } },
      resultCodec: confirmMaterialOutboundResultCodec,
      handler: async () => {
        const result = await this.outbounds.confirmOutbound(outboundId, version, commandContext);
        return { ...result, outbound: await this.enrichOutbound(result.outbound) };
      },
    });
    return execution.result;
  }
  async cancelOutbound(
    outboundId: string,
    version: number,
    reason: string,
    context: CommandContext,
  ) {
    const normalizedReason = reason.trim();
    if (!normalizedReason) throw new ProductionDomainError('INVALID_INPUT', '取消原因不能为空');
    return this.enrichOutbound(
      await this.outbounds.cancelOutbound(outboundId, version, normalizedReason, context),
    );
  }
  private async enrichOutbound(row: MaterialOutboundItem): Promise<MaterialOutboundItem> {
    return (await this.enrichOutbounds([row]))[0]!;
  }
  private async enrichOutbounds(rows: MaterialOutboundItem[]): Promise<MaterialOutboundItem[]> {
    if (rows.length === 0) return rows;
    const ids = rows
      .flatMap((row) => [row.operatorId, row.createdById, row.cancelledById])
      .filter((id): id is string => Boolean(id));
    const users = await this.identity.listUserReferencesByIds([...new Set(ids)]);
    const byId = new Map(users.map((user) => [user.id, user.displayName]));
    return rows.map((row) => ({
      ...row,
      operatorName: row.operatorId ? (byId.get(row.operatorId) ?? null) : null,
      createdByName: row.createdById ? (byId.get(row.createdById) ?? null) : null,
      cancelledByName: row.cancelledById ? (byId.get(row.cancelledById) ?? null) : null,
    }));
  }
}

const narrow = (context: IdempotentCommandContext): CommandContext => ({
  actorId: context.actorId,
  requestId: context.requestId,
  ip: context.ip,
  userAgent: context.userAgent,
});
