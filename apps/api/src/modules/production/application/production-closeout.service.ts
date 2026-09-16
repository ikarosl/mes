import { Injectable } from '@nestjs/common';
import type {
  BeginBatchCloseoutPayload,
  HandleBatchCloseoutItemPayload,
  SaveBatchCloseoutOutputPayload,
  SubmitBatchCloseoutPayload,
} from '@company/contracts';
import { ApprovalService } from '../../approval/public.js';
import { BATCH_CLOSEOUT_APPROVAL_SCENE } from '../approval-scenes.js';
import type { IdempotentCommandContext } from '../../../common/audit/audit.types.js';
import { IdempotencyExecutor } from '../../../common/idempotency/idempotency-executor.js';
import { ProductionCloseoutRepository } from './ports/production-closeout.repository.js';
import {
  BEGIN_BATCH_CLOSEOUT_SCOPE,
  HANDLE_BATCH_CLOSEOUT_SCOPE,
  SAVE_BATCH_CLOSEOUT_OUTPUT_SCOPE,
  SUBMIT_BATCH_CLOSEOUT_SCOPE,
} from './idempotency/production-idempotency-scopes.contract.js';
import {
  productionApprovalResultCodec,
  batchCloseoutResultCodec,
} from './idempotency/production-approval-result.codec.js';
@Injectable()
export class ProductionCloseoutService {
  constructor(
    private readonly repository: ProductionCloseoutRepository,
    private readonly approval: ApprovalService,
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
  async saveOutput(
    batchId: string,
    payload: SaveBatchCloseoutOutputPayload,
    context: IdempotentCommandContext,
  ) {
    const body = {
      ...payload,
      reason: payload.reason.trim(),
      materialReviewNote: payload.materialReviewNote.trim(),
    };
    const { actorId, requestId, ip, userAgent } = context;
    const execution = await this.idempotency.execute({
      scope: SAVE_BATCH_CLOSEOUT_OUTPUT_SCOPE,
      key: context.idempotencyKey,
      actorId,
      requestId,
      request: { params: { batchId }, body },
      resultCodec: batchCloseoutResultCodec,
      handler: () =>
        this.repository.saveOutput(batchId, body, { actorId, requestId, ip, userAgent }),
    });
    return execution.result;
  }
  async submit(
    batchId: string,
    payload: SubmitBatchCloseoutPayload,
    context: IdempotentCommandContext,
  ) {
    const body = { version: payload.version, checkToken: payload.checkToken };
    const { actorId, requestId, ip, userAgent } = context;
    const execution = await this.idempotency.execute({
      scope: SUBMIT_BATCH_CLOSEOUT_SCOPE,
      key: context.idempotencyKey,
      actorId,
      requestId,
      request: { params: { batchId }, body },
      resultCodec: productionApprovalResultCodec,
      handler: async () => {
        const subjectId = await this.repository.validateSubmission(batchId, body);
        const instance = await this.approval.submit(
          {
            sceneCode: BATCH_CLOSEOUT_APPROVAL_SCENE.code,
            subjectId,
            expectedVersion: body.version,
          },
          { actorId, requestId, ip, userAgent },
        );
        return { subjectId, approvalInstanceId: instance.id };
      },
    });
    return execution.result;
  }
}
