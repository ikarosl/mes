import { Injectable } from '@nestjs/common';
import type { TerminateProductionBatchPayload } from '@company/contracts';
import type { IdempotentCommandContext } from '../../../common/audit/audit.types.js';
import { IdempotencyExecutor } from '../../../common/idempotency/idempotency-executor.js';
import { ProductionTerminationRepository } from './ports/production-termination.repository.js';
import { TERMINATE_BATCH_IDEMPOTENCY_SCOPE } from './idempotency/production-idempotency-scopes.contract.js';
import { terminateBatchResultCodec } from './idempotency/production-termination-result.codec.js';

@Injectable()
export class ProductionTerminationService {
  constructor(
    private readonly repository: ProductionTerminationRepository,
    private readonly idempotency: IdempotencyExecutor,
  ) {}

  getCheck(batchId: string) {
    return this.repository.getCheck(batchId);
  }

  async terminate(
    batchId: string,
    payload: TerminateProductionBatchPayload,
    context: IdempotentCommandContext,
  ) {
    const body = {
      ...payload,
      reason: payload.reason.trim(),
      materialReviewNote: payload.materialReviewNote.trim(),
    };
    const { actorId, requestId, ip, userAgent } = context;
    const execution = await this.idempotency.execute({
      scope: TERMINATE_BATCH_IDEMPOTENCY_SCOPE,
      key: context.idempotencyKey,
      actorId,
      requestId,
      request: { params: { batchId }, body },
      resultCodec: terminateBatchResultCodec,
      handler: () =>
        this.repository.terminate(batchId, body, { actorId, requestId, ip, userAgent }),
    });
    return execution.result;
  }
}
