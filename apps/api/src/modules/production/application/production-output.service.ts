import { Injectable } from '@nestjs/common';
import type {
  SaveProductionOutputPayload,
  ReviewProductionOutputMaterialPayload,
  SubmitProductionOutputPayload,
  BeginProductionOutputCorrectionPayload,
} from '@company/contracts';
import type {
  CommandContext,
  IdempotentCommandContext,
} from '../../../common/audit/audit.types.js';
import { IdempotencyExecutor } from '../../../common/idempotency/idempotency-executor.js';
import { ApprovalService } from '../../approval/public.js';
import { IdentityDirectoryService } from '../../identity/public.js';
import { BATCH_CLOSEOUT_APPROVAL_SCENE } from '../approval-scenes.js';
import { ProductionCloseoutRepository } from './ports/production-closeout.repository.js';
import { ProductionOutputRepository } from './ports/production-output.repository.js';
import {
  SAVE_PRODUCTION_OUTPUT_SCOPE,
  REVIEW_OUTPUT_MATERIAL_SCOPE,
  SUBMIT_PRODUCTION_OUTPUT_SCOPE,
  BEGIN_OUTPUT_CORRECTION_SCOPE,
  CANCEL_OUTPUT_CORRECTION_SCOPE,
} from './idempotency/production-idempotency-scopes.contract.js';
import {
  productionOutputResultCodec,
  productionApprovalResultCodec,
} from './idempotency/production-approval-result.codec.js';
@Injectable()
export class ProductionOutputService {
  constructor(
    private readonly repository: ProductionOutputRepository,
    private readonly closeout: ProductionCloseoutRepository,
    private readonly approval: ApprovalService,
    private readonly identity: IdentityDirectoryService,
    private readonly idempotency: IdempotencyExecutor,
  ) {}
  async detail(batchId: string) {
    const detail = await this.repository.detail(batchId);
    if (!detail) return null;
    const ids = [
      ...new Set(
        [
          detail.workOrderOwnerId,
          ...detail.inspections.map((row) => row.createdBy),
          ...detail.revisions.map((row) => row.approvedBy),
        ].filter(Boolean),
      ),
    ];
    const names = new Map(
      (await this.identity.listUserReferencesByIds(ids)).map((user) => [user.id, user.displayName]),
    );
    return {
      ...detail,
      workOrderOwnerName: names.get(detail.workOrderOwnerId) ?? detail.workOrderOwnerId,
      inspections: detail.inspections.map((row) => ({
        ...row,
        createdByName: names.get(row.createdBy) ?? row.createdBy,
      })),
      revisions: detail.revisions.map((row) => ({
        ...row,
        approvedByName: names.get(row.approvedBy) ?? row.approvedBy,
      })),
    };
  }
  async reviewMaterial(
    batchId: string,
    payload: ReviewProductionOutputMaterialPayload,
    context: IdempotentCommandContext,
  ) {
    const body = {
      version: payload.version,
      checkToken: payload.checkToken,
      targetId: payload.targetId,
      reason: payload.reason.trim(),
    };
    const execution = await this.idempotency.execute({
      scope: REVIEW_OUTPUT_MATERIAL_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { batchId }, body },
      resultCodec: productionOutputResultCodec,
      handler: () =>
        this.closeout.handle(
          batchId,
          { ...body, kind: 'material', targetVersion: 0 },
          narrow(context),
        ),
    });
    return execution.result;
  }
  async saveDraft(
    batchId: string,
    payload: SaveProductionOutputPayload,
    context: IdempotentCommandContext,
  ) {
    const body = {
      version: payload.version,
      availableQuantity: payload.availableQuantity,
      extraQuantity: payload.extraQuantity,
      additionalScrapQuantity: payload.additionalScrapQuantity,
      reason: payload.reason.trim(),
      materialReviewNote: payload.materialReviewNote.trim(),
      inspectionRecordId: payload.inspectionRecordId ?? null,
    };
    const execution = await this.idempotency.execute({
      scope: SAVE_PRODUCTION_OUTPUT_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { batchId }, body },
      resultCodec: productionOutputResultCodec,
      handler: () => this.repository.saveDraft(batchId, body, narrow(context)),
    });
    return execution.result;
  }
  async beginCorrection(
    batchId: string,
    payload: BeginProductionOutputCorrectionPayload,
    context: IdempotentCommandContext,
  ) {
    const body = {
      version: payload.version,
      currentRevisionId: payload.currentRevisionId,
      reason: payload.reason.trim(),
    };
    const execution = await this.idempotency.execute({
      scope: BEGIN_OUTPUT_CORRECTION_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { batchId }, body },
      resultCodec: productionOutputResultCodec,
      handler: () => this.repository.beginCorrection(batchId, body, narrow(context)),
    });
    return execution.result;
  }
  async cancelCorrection(batchId: string, version: number, context: IdempotentCommandContext) {
    const body = { version };
    const execution = await this.idempotency.execute({
      scope: CANCEL_OUTPUT_CORRECTION_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { batchId }, body },
      resultCodec: productionOutputResultCodec,
      handler: () => this.repository.cancelCorrection(batchId, version, narrow(context)),
    });
    return execution.result;
  }
  async submit(
    batchId: string,
    payload: SubmitProductionOutputPayload,
    context: IdempotentCommandContext,
  ) {
    const body = { version: payload.version, submissionToken: payload.submissionToken };
    const audit = narrow(context);
    const execution = await this.idempotency.execute({
      scope: SUBMIT_PRODUCTION_OUTPUT_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
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
          audit,
        );
        return { subjectId, approvalInstanceId: instance.id };
      },
    });
    return execution.result;
  }
}

const narrow = ({ actorId, requestId, ip, userAgent }: CommandContext): CommandContext => ({
  actorId,
  requestId,
  ip,
  userAgent,
});
