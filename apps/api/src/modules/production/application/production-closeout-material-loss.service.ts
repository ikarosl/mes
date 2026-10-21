import { Injectable } from '@nestjs/common';
import type { RecordCloseoutMaterialLossPayload } from '@company/contracts';
import type { IdempotentCommandContext } from '../../../common/audit/audit.types.js';
import { IdempotencyExecutor } from '../../../common/idempotency/idempotency-executor.js';
import { ProductionCloseoutMaterialLossRepository } from './ports/production-closeout-material-loss.repository.js';
import { RECORD_CLOSEOUT_MATERIAL_LOSS_SCOPE } from './idempotency/production-idempotency-scopes.contract.js';
import { recordCloseoutMaterialLossResultCodec } from './idempotency/production-closeout-material-loss-result.codec.js';

@Injectable()
export class ProductionCloseoutMaterialLossService {
  constructor(
    private readonly repository: ProductionCloseoutMaterialLossRepository,
    private readonly idempotency: IdempotencyExecutor,
  ) {}
  async record(
    batchId: string,
    payload: RecordCloseoutMaterialLossPayload,
    context: IdempotentCommandContext,
  ) {
    const body = {
      version: payload.version,
      checkToken: payload.checkToken,
      allocationId: payload.allocationId,
      scrapQuantity: payload.scrapQuantity,
      reason: payload.reason.trim(),
    };
    const { actorId, requestId, ip, userAgent } = context;
    const execution = await this.idempotency.execute({
      scope: RECORD_CLOSEOUT_MATERIAL_LOSS_SCOPE,
      key: context.idempotencyKey,
      actorId,
      requestId,
      request: { params: { batchId }, body },
      resultCodec: recordCloseoutMaterialLossResultCodec,
      handler: () => this.repository.record(batchId, body, { actorId, requestId, ip, userAgent }),
    });
    return execution.result;
  }
}
