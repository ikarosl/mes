import { Injectable } from '@nestjs/common';
import type { BeginBatchCloseoutPayload, HandleBatchCloseoutItemPayload } from '@company/contracts';
import type { IdempotentCommandContext } from '../../../common/audit/audit.types.js';
import { IdempotencyExecutor } from '../../../common/idempotency/idempotency-executor.js';
import { ProductionCloseoutRepository } from './ports/production-closeout.repository.js';
import {
  BEGIN_BATCH_CLOSEOUT_SCOPE,
  HANDLE_BATCH_CLOSEOUT_SCOPE,
} from './idempotency/production-idempotency-scopes.contract.js';
import { batchCloseoutResultCodec } from './idempotency/production-approval-result.codec.js';
@Injectable()
export class ProductionCloseoutService {
  constructor(
    private readonly repository: ProductionCloseoutRepository,
    private readonly idempotency: IdempotencyExecutor,
  ) {}
  detail(batchId: string) {
    return this.repository.detail(batchId);
  }
  async begin(
    batchId: string,
    payload: BeginBatchCloseoutPayload,
    context: IdempotentCommandContext,
  ) {
    const body = { ...payload, reason: payload.reason.trim() };
    const { actorId, requestId, ip, userAgent } = context;
    const execution = await this.idempotency.execute({
      scope: BEGIN_BATCH_CLOSEOUT_SCOPE,
      key: context.idempotencyKey,
      actorId,
      requestId,
      request: { params: { batchId }, body },
      resultCodec: batchCloseoutResultCodec,
      handler: () => this.repository.begin(batchId, body, { actorId, requestId, ip, userAgent }),
    });
    return execution.result;
  }
  async handle(
    batchId: string,
    payload: HandleBatchCloseoutItemPayload,
    context: IdempotentCommandContext,
  ) {
    const body = { ...payload, reason: payload.reason.trim() };
    const { actorId, requestId, ip, userAgent } = context;
    const execution = await this.idempotency.execute({
      scope: HANDLE_BATCH_CLOSEOUT_SCOPE,
      key: context.idempotencyKey,
      actorId,
      requestId,
      request: { params: { batchId }, body },
      resultCodec: batchCloseoutResultCodec,
      handler: () => this.repository.handle(batchId, body, { actorId, requestId, ip, userAgent }),
    });
    return execution.result;
  }
}
