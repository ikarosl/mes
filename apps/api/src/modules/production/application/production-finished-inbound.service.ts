import { Injectable } from '@nestjs/common';
import type {
  FinishedGoodsInboundQuery,
  FinishedGoodsInboundCandidateQuery,
  FinishedGoodsInboundOrderItem,
  CreateFinishedGoodsInboundPayload,
  UpdateFinishedGoodsInboundPayload,
  ConfirmFinishedGoodsInboundPayload,
  CancelFinishedGoodsInboundPayload,
  ProductionOutputRevision,
} from '@company/contracts';
import type {
  CommandContext,
  IdempotentCommandContext,
} from '../../../common/audit/audit.types.js';
import { IdempotencyExecutor } from '../../../common/idempotency/idempotency-executor.js';
import { IdentityDirectoryService } from '../../identity/public.js';
import { ProductionFinishedInboundRepository } from './ports/production-finished-inbound.repository.js';
import { productionFinishedInboundResultCodec } from './idempotency/production-finished-inbound-result.codec.js';
import {
  CREATE_FINISHED_INBOUND_SCOPE,
  UPDATE_FINISHED_INBOUND_SCOPE,
  CONFIRM_FINISHED_INBOUND_SCOPE,
  CANCEL_FINISHED_INBOUND_SCOPE,
} from './idempotency/production-idempotency-scopes.contract.js';

@Injectable()
export class ProductionFinishedInboundService {
  constructor(
    private readonly repository: ProductionFinishedInboundRepository,
    private readonly identity: IdentityDirectoryService,
    private readonly idempotency: IdempotencyExecutor,
  ) {}
  async list(query: FinishedGoodsInboundQuery) {
    const page = await this.repository.list(query);
    const names = await this.names(page.items);
    return { ...page, items: page.items.map((row) => enrichOrder(row, names)) };
  }
  candidates(query: FinishedGoodsInboundCandidateQuery) {
    return this.repository.candidates(query);
  }
  async get(id: string) {
    const detail = await this.repository.get(id);
    const names = await this.names([detail], [detail.approvedOutput, detail.currentApprovedOutput]);
    return {
      ...enrichOrder(detail, names),
      approvedOutput: enrichRevision(detail.approvedOutput, names),
      currentApprovedOutput: enrichRevision(detail.currentApprovedOutput, names),
    };
  }
  async create(payload: CreateFinishedGoodsInboundPayload, context: IdempotentCommandContext) {
    const body = {
      productionBatchId: payload.productionBatchId,
      sourceType: payload.sourceType,
      outputRevisionId: payload.outputRevisionId,
      batchCode: payload.batchCode.trim(),
      remark: payload.remark?.trim() || null,
    };
    const execution = await this.idempotency.execute({
      scope: CREATE_FINISHED_INBOUND_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { body },
      resultCodec: productionFinishedInboundResultCodec,
      handler: () => this.repository.create(body, narrow(context)),
    });
    return execution.result;
  }
  async update(
    id: string,
    payload: UpdateFinishedGoodsInboundPayload,
    context: IdempotentCommandContext,
  ) {
    const body = {
      version: payload.version,
      outputRevisionId: payload.outputRevisionId,
      batchCode: payload.batchCode.trim(),
      remark: payload.remark?.trim() || null,
    };
    const execution = await this.idempotency.execute({
      scope: UPDATE_FINISHED_INBOUND_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { inboundId: id }, body },
      resultCodec: productionFinishedInboundResultCodec,
      handler: () => this.repository.update(id, body, narrow(context)),
    });
    return execution.result;
  }
  async confirm(
    id: string,
    payload: ConfirmFinishedGoodsInboundPayload,
    context: IdempotentCommandContext,
  ) {
    const body = { version: payload.version, outputRevisionId: payload.outputRevisionId };
    const execution = await this.idempotency.execute({
      scope: CONFIRM_FINISHED_INBOUND_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { inboundId: id }, body },
      resultCodec: productionFinishedInboundResultCodec,
      handler: () => this.repository.confirm(id, body, narrow(context)),
    });
    return execution.result;
  }
  async cancel(
    id: string,
    payload: CancelFinishedGoodsInboundPayload,
    context: IdempotentCommandContext,
  ) {
    const body = { version: payload.version, reason: payload.reason.trim() };
    const execution = await this.idempotency.execute({
      scope: CANCEL_FINISHED_INBOUND_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { inboundId: id }, body },
      resultCodec: productionFinishedInboundResultCodec,
      handler: () => this.repository.cancel(id, body, narrow(context)),
    });
    return execution.result;
  }
  private async names(
    rows: FinishedGoodsInboundOrderItem[],
    revisions: ProductionOutputRevision[] = [],
  ) {
    const ids = [
      ...new Set(
        [
          ...rows.flatMap((row) => [row.createdById, row.operatorId, row.cancelledById]),
          ...revisions.flatMap((revision) => [
            revision.approvedBy,
            revision.snapshot.inspection.createdBy,
          ]),
        ].filter((id): id is string => id !== null),
      ),
    ];
    return new Map(
      (await this.identity.listUserReferencesByIds(ids)).map((user) => [user.id, user.displayName]),
    );
  }
}
const narrow = (context: IdempotentCommandContext): CommandContext => ({
  actorId: context.actorId,
  requestId: context.requestId,
  ip: context.ip,
  userAgent: context.userAgent,
});
function enrichOrder<T extends FinishedGoodsInboundOrderItem>(
  row: T,
  names: Map<string, string>,
): T {
  return {
    ...row,
    createdByName: names.get(row.createdById) ?? row.createdById,
    operatorName: row.operatorId ? (names.get(row.operatorId) ?? row.operatorId) : null,
    cancelledByName: row.cancelledById ? (names.get(row.cancelledById) ?? row.cancelledById) : null,
  };
}
function enrichRevision(
  revision: ProductionOutputRevision,
  names: Map<string, string>,
): ProductionOutputRevision {
  const inspection = revision.snapshot.inspection;
  return {
    ...revision,
    approvedByName: names.get(revision.approvedBy) ?? revision.approvedBy,
    snapshot: {
      ...revision.snapshot,
      inspection: {
        ...inspection,
        createdByName: names.get(inspection.createdBy) ?? inspection.createdBy,
      },
    },
  };
}
