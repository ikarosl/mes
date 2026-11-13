import { Injectable } from '@nestjs/common';
import type {
  CreateProductionOutputInboundPayload,
  ProductionOutputQuery,
  RevokeProductionOutputPayload,
} from '@company/contracts';
import type { IdempotentCommandContext } from '../../../common/audit/audit.types.js';
import { IdempotencyExecutor } from '../../../common/idempotency/idempotency-executor.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { ProductionOutputRepository } from './ports/production-output.repository.js';
import { PRODUCTION_OUTPUT_SCOPES } from './idempotency/production-idempotency-scopes.contract.js';
import {
  productionOutputInboundResultCodec,
  productionOutputResultCodec,
} from './idempotency/production-output-result.codec.js';

@Injectable()
export class ProductionOutputService {
  constructor(
    private readonly repository: ProductionOutputRepository,
    private readonly idempotency: IdempotencyExecutor,
  ) {}

  list(query: ProductionOutputQuery) {
    return this.repository.list({ ...query, keyword: query.keyword?.trim() || undefined });
  }

  async revoke(
    outputId: string,
    payload: RevokeProductionOutputPayload,
    context: IdempotentCommandContext,
  ) {
    const reason = payload.reason.trim();
    if (!reason) throw new ProductionDomainError('INVALID_INPUT', '请填写撤销原因');
    return (
      await this.idempotency.execute({
        scope: PRODUCTION_OUTPUT_SCOPES.revoke,
        key: context.idempotencyKey,
        actorId: context.actorId,
        requestId: context.requestId,
        request: { params: { outputId }, body: { reason } },
        resultCodec: productionOutputResultCodec,
        handler: () => this.repository.revoke(outputId, reason, context),
      })
    ).result;
  }

  async inbound(
    batchId: string,
    payload: CreateProductionOutputInboundPayload,
    context: IdempotentCommandContext,
  ) {
    if (
      !payload.outputIds.length ||
      payload.outputIds.length > 100 ||
      new Set(payload.outputIds).size !== payload.outputIds.length
    )
      throw new ProductionDomainError('INVALID_INPUT', '请选择不重复的产出记录，每次最多 100 笔');
    const target =
      payload.target.mode === 'new_batch'
        ? { mode: 'new_batch' as const }
        : {
            mode: 'existing_batch' as const,
            itemBatchId: payload.target.itemBatchId,
            version: payload.target.version,
          };
    if (
      payload.target.mode === 'new_batch' &&
      Object.entries(payload.target).some(([key, value]) => key !== 'mode' && value !== undefined)
    )
      throw new ProductionDomainError('INVALID_INPUT', '新建库批时不能指定已有库批或版本');
    const body: CreateProductionOutputInboundPayload = {
      outputIds: [...payload.outputIds].sort((a, b) => a.length - b.length || a.localeCompare(b)),
      target,
      remark: payload.remark?.trim() || null,
    };
    return (
      await this.idempotency.execute({
        scope: PRODUCTION_OUTPUT_SCOPES.inbound,
        key: context.idempotencyKey,
        actorId: context.actorId,
        requestId: context.requestId,
        request: { params: { batchId }, body },
        resultCodec: productionOutputInboundResultCodec,
        handler: () => this.repository.inbound(batchId, body, context),
      })
    ).result;
  }
}
