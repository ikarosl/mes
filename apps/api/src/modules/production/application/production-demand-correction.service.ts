import { Injectable } from '@nestjs/common';
import type { SubmitDemandCorrectionPayload, ProductionApprovalResult } from '@company/contracts';
import { ApprovalService } from '../../approval/public.js';
import { DEMAND_CORRECTION_APPROVAL_SCENE } from '../approval-scenes.js';
import type { IdempotentCommandContext } from '../../../common/audit/audit.types.js';
import { IdempotencyExecutor } from '../../../common/idempotency/idempotency-executor.js';
import { ProductionDemandCorrectionRepository } from './ports/production-demand-correction.repository.js';
import { SUBMIT_DEMAND_CORRECTION_SCOPE } from './idempotency/production-idempotency-scopes.contract.js';
import { productionApprovalResultCodec } from './idempotency/production-approval-result.codec.js';

@Injectable()
export class ProductionDemandCorrectionService {
  constructor(
    private readonly repository: ProductionDemandCorrectionRepository,
    private readonly approval: ApprovalService,
    private readonly idempotency: IdempotencyExecutor,
  ) {}
  getCheck(demandId: string) {
    return this.repository.getCheck(demandId);
  }
  history(demandId: string) {
    return this.repository.listHistory(demandId);
  }
  async submit(
    demandId: string,
    payload: SubmitDemandCorrectionPayload,
    context: IdempotentCommandContext,
  ): Promise<ProductionApprovalResult> {
    const body = { ...payload, reason: payload.reason.trim() };
    const { actorId, requestId, ip, userAgent } = context;
    const audit = { actorId, requestId, ip, userAgent };
    const execution = await this.idempotency.execute({
      scope: SUBMIT_DEMAND_CORRECTION_SCOPE,
      key: context.idempotencyKey,
      actorId,
      requestId,
      request: { params: { demandId }, body },
      resultCodec: productionApprovalResultCodec,
      handler: async () => {
        const subjectId = await this.repository.createRequest(demandId, body, audit);
        const instance = await this.approval.submit(
          { sceneCode: DEMAND_CORRECTION_APPROVAL_SCENE.code, subjectId, expectedVersion: 0 },
          audit,
        );
        return { subjectId, approvalInstanceId: instance.id };
      },
    });
    return execution.result;
  }
}
