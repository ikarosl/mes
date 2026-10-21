import { Injectable } from '@nestjs/common';
import type {
  BeginBatchCloseoutPayload,
  HandleBatchCloseoutItemPayload,
  WithdrawBatchCloseoutPayload,
} from '@company/contracts';
import type { IdempotentCommandContext } from '../../../common/audit/audit.types.js';
import { IdempotencyExecutor } from '../../../common/idempotency/idempotency-executor.js';
import { ProductionCloseoutRepository } from './ports/production-closeout.repository.js';
import {
  BEGIN_BATCH_CLOSEOUT_SCOPE,
  HANDLE_BATCH_CLOSEOUT_SCOPE,
  WITHDRAW_BATCH_CLOSEOUT_SCOPE,
} from './idempotency/production-idempotency-scopes.contract.js';
import { batchCloseoutResultCodec } from './idempotency/production-approval-result.codec.js';
import { withdrawBatchCloseoutResultCodec } from './idempotency/production-closeout-task-result.codec.js';
@Injectable()
export class ProductionCloseoutService {
  constructor(
    private readonly repository: ProductionCloseoutRepository,
    private readonly idempotency: IdempotencyExecutor,
  ) {}
  detail(batchId: string) {
    return this.repository.detail(batchId);
  }
  withdrawalCheck(batchId: string) {
    return this.repository.withdrawalCheck(batchId);
  }
  async withdraw(
    batchId: string,
    payload: WithdrawBatchCloseoutPayload,
    context: IdempotentCommandContext,
  ) {
    const body = {
      version: payload.version,
      closeoutVersion: payload.closeoutVersion,
      reason: payload.reason.trim(),
    };
    const { actorId, requestId, ip, userAgent } = context;
    const execution = await this.idempotency.execute({
      scope: WITHDRAW_BATCH_CLOSEOUT_SCOPE,
      key: context.idempotencyKey,
      actorId,
      requestId,
      request: { params: { batchId }, body },
      resultCodec: withdrawBatchCloseoutResultCodec,
      handler: () => this.repository.withdraw(batchId, body, { actorId, requestId, ip, userAgent }),
    });
    return execution.result;
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
