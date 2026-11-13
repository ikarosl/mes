import { Injectable } from '@nestjs/common';
import { PRODUCTION_TRACKING_SCOPES } from './idempotency/production-idempotency-scopes.contract.js';
import type {
  ConfirmProductionTrackingOutputPayload,
  ConfirmProductionResearchOutputPayload,
  CorrectProductionTrackingQuantityPayload,
  CreateProductionTrackingAbnormalityPayload,
  CreateProductionTrackingCardPayload,
  FinishProductionTrackingTaskPayload,
  HandleProductionTrackingAbnormalityPayload,
  ProductionTrackingCardQuery,
  ProductionTrackingPersonnelSnapshot,
  ProductionTrackingReportQuery,
  ReopenProductionTrackingTaskPayload,
  ScanProductionTrackingCardPayload,
  VoidProductionTrackingCardPayload,
} from '@company/contracts';
import type { IdempotentCommandContext } from '../../../common/audit/audit.types.js';
import {
  IdempotencyExecutor,
  type IdempotencyResultCodec,
} from '../../../common/idempotency/idempotency-executor.js';
import { PersonnelService } from '../../identity/public.js';
import { TechnicalFileContentQuery } from '../../product/public.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { ProductionTrackingRepository } from './ports/production-tracking.repository.js';
import { productionBatchResultCodec } from './idempotency/production-batch-result.codec.js';
import {
  trackingCardResultCodec,
  trackingOutputResultCodec,
  trackingScanResultCodec,
} from './idempotency/production-tracking-result.codec.js';

@Injectable()
export class ProductionTrackingService {
  constructor(
    private readonly repository: ProductionTrackingRepository,
    private readonly personnel: PersonnelService,
    private readonly idempotency: IdempotencyExecutor,
    private readonly files: TechnicalFileContentQuery,
  ) {}

  list(query: ProductionTrackingCardQuery) {
    return this.repository.list({ ...query, keyword: query.keyword?.trim() || undefined });
  }
  get(cardId: string) {
    return this.repository.get(cardId);
  }
  workbench(batchId: string) {
    return this.repository.workbench(batchId);
  }
  reports(query: ProductionTrackingReportQuery) {
    return this.repository.reports(query);
  }
  startCheck(batchId: string) {
    return this.repository.startCheck(batchId);
  }

  create(
    batchId: string,
    payload: CreateProductionTrackingCardPayload,
    context: IdempotentCommandContext,
  ) {
    const body = { ...payload, remark: payload.remark?.trim() || null };
    return this.execute('create', { batchId }, body, context, trackingCardResultCodec, () =>
      this.repository.withBatchTransaction(batchId, async () =>
        this.repository.create(batchId, body, await this.person(body.personnelId), context),
      ),
    );
  }
  scan(payload: ScanProductionTrackingCardPayload, context: IdempotentCommandContext) {
    const body = { ...payload, cardNo: payload.cardNo.trim() };
    return this.execute('scan', {}, body, context, trackingScanResultCodec, () =>
      this.repository.withCardTransaction(body.cardNo, true, async (cardId) =>
        this.repository.scan(cardId, body, await this.person(body.personnelId), context),
      ),
    );
  }
  correctQuantity(
    cardId: string,
    payload: CorrectProductionTrackingQuantityPayload,
    context: IdempotentCommandContext,
  ) {
    const body = { ...payload, reason: this.reason(payload.reason) };
    return this.execute(
      'correct-quantity',
      { cardId },
      body,
      context,
      trackingCardResultCodec,
      () =>
        this.repository.withCardTransaction(cardId, false, (id) =>
          this.repository.correctQuantity(id, body, context),
        ),
    );
  }
  void(
    cardId: string,
    payload: VoidProductionTrackingCardPayload,
    context: IdempotentCommandContext,
  ) {
    const body = { ...payload, reason: this.reason(payload.reason) };
    return this.execute('void', { cardId }, body, context, trackingCardResultCodec, () =>
      this.repository.withCardTransaction(cardId, false, (id) =>
        this.repository.void(id, body, context),
      ),
    );
  }
  createAbnormality(
    cardId: string,
    payload: CreateProductionTrackingAbnormalityPayload,
    context: IdempotentCommandContext,
  ) {
    const body = { ...payload, description: this.reason(payload.description) };
    return this.execute(
      'abnormality.create',
      { cardId },
      body,
      context,
      trackingCardResultCodec,
      () =>
        this.repository.withCardTransaction(cardId, false, async (id) =>
          this.repository.createAbnormality(id, body, await this.person(body.personnelId), context),
        ),
    );
  }
  handleAbnormality(
    cardId: string,
    abnormalityId: string,
    payload: HandleProductionTrackingAbnormalityPayload,
    context: IdempotentCommandContext,
  ) {
    const body = {
      ...payload,
      content: this.reason(payload.content),
      scrapReferences: payload.scrapReferences.map(({ handlingId, quantity }) => ({
        handlingId,
        quantity,
      })),
    };
    return this.execute(
      'abnormality.handle',
      { cardId, abnormalityId },
      body,
      context,
      trackingCardResultCodec,
      () =>
        this.repository.withCardTransaction(cardId, false, async (id) =>
          this.repository.handleAbnormality(
            id,
            abnormalityId,
            body,
            await this.person(body.personnelId),
            context,
          ),
        ),
    );
  }
  confirmOutput(
    cardId: string,
    payload: ConfirmProductionTrackingOutputPayload,
    context: IdempotentCommandContext,
  ) {
    const body = { ...payload, remark: payload.remark?.trim() || null };
    return this.execute('confirm-output', { cardId }, body, context, trackingCardResultCodec, () =>
      this.repository.withCardTransaction(cardId, false, async (id) =>
        this.repository.confirmOutput(id, body, await this.person(body.personnelId), context),
      ),
    );
  }
  confirmResearchOutput(
    batchId: string,
    payload: ConfirmProductionResearchOutputPayload,
    context: IdempotentCommandContext,
  ) {
    const body = { ...payload, remark: payload.remark?.trim() || null };
    return this.execute(
      'confirm-research-output',
      { batchId },
      body,
      context,
      trackingOutputResultCodec,
      () =>
        this.repository.withBatchTransaction(batchId, async () =>
          this.repository.confirmResearchOutput(
            batchId,
            body,
            await this.person(body.personnelId),
            context,
          ),
        ),
    );
  }
  startTask(
    batchId: string,
    payload: { version: number; reason?: string | null },
    context: IdempotentCommandContext,
  ) {
    const body = { version: payload.version, reason: payload.reason?.trim() || null };
    return this.execute('task.start', { batchId }, body, context, productionBatchResultCodec, () =>
      this.repository.withBatchTransaction(batchId, () =>
        this.repository.startTask(batchId, body.version, body.reason, context),
      ),
    );
  }
  finishTask(
    batchId: string,
    payload: FinishProductionTrackingTaskPayload,
    context: IdempotentCommandContext,
  ) {
    const body = { ...payload, reason: this.reason(payload.reason) };
    return this.execute('task.finish', { batchId }, body, context, productionBatchResultCodec, () =>
      this.repository.withBatchTransaction(batchId, () =>
        this.repository.finishTask(batchId, body, context),
      ),
    );
  }
  reopenTask(
    batchId: string,
    payload: ReopenProductionTrackingTaskPayload,
    context: IdempotentCommandContext,
  ) {
    const body = { version: payload.version, reason: this.reason(payload.reason) };
    return this.execute('task.reopen', { batchId }, body, context, productionBatchResultCodec, () =>
      this.repository.withBatchTransaction(batchId, () =>
        this.repository.reopenTask(batchId, body, context),
      ),
    );
  }
  async sop(batchId: string, recordId: string) {
    const reference = await this.repository.sopReference(batchId, recordId);
    const content = await this.files.readHistoricalSnapshot(reference);
    return { ...content, fileName: reference.fileName };
  }
  private async person(id: string): Promise<ProductionTrackingPersonnelSnapshot> {
    const person = await this.personnel.requireActive(id);
    return { personnelId: person.id, personnelCode: person.code, personnelName: person.name };
  }
  private reason(value: string): string {
    const result = value.trim();
    if (!result) throw new ProductionDomainError('INVALID_INPUT', '请填写原因或处理说明');
    return result;
  }
  private async execute<T>(
    action: keyof typeof PRODUCTION_TRACKING_SCOPES,
    params: Record<string, string>,
    body: unknown,
    context: IdempotentCommandContext,
    resultCodec: IdempotencyResultCodec<T>,
    handler: () => Promise<T>,
  ): Promise<T> {
    return (
      await this.idempotency.execute({
        scope: PRODUCTION_TRACKING_SCOPES[action],
        key: context.idempotencyKey,
        actorId: context.actorId,
        requestId: context.requestId,
        request: { params, body },
        resultCodec,
        handler,
      })
    ).result;
  }
}
