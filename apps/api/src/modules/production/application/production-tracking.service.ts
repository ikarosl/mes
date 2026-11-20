import { Injectable } from '@nestjs/common';
import {
  isCanonicalTrackingCardNo,
  normalizeTrackingCardNo,
  normalizeTrackingItemMarkCode,
  TRACKING_ITEM_MARK_CODE_ERROR_MESSAGE,
  TRACKING_ITEM_MARK_CODE_PATTERN,
} from '@company/utils';
import {
  PRODUCTION_TRACKING_ABNORMALITY_LABEL_LIMIT,
  PRODUCTION_TRACKING_ABNORMALITY_LABEL_MAX_LENGTH,
} from '@company/constants';
import { PRODUCTION_TRACKING_SCOPES } from './idempotency/production-idempotency-scopes.contract.js';
import type {
  BindProductionTrackingItemMarkPayload,
  CancelProductionTrackingItemMarkPayload,
  CorrectProductionTrackingItemMarkPayload,
  PageQuery,
  ProductionTrackingItemMarkQuery,
  ProductionTrackingItemMarkWorkspaceQuery,
  SaveProductionTrackingItemMarkWorkspacePayload,
  ConfirmProductionTrackingOutputPayload,
  ConfirmProductionResearchOutputPayload,
  CorrectProductionTrackingAbnormalityScrapPayload,
  CorrectProductionTrackingQuantityPayload,
  CreateProductionTrackingAbnormalityPayload,
  CreateProductionTrackingCardPayload,
  CreateProductionTrackingCardsPayload,
  FinishProductionTrackingTaskPayload,
  HandleProductionTrackingAbnormalityPayload,
  PageResult,
  ProductionTrackingCardDetail,
  ProductionTrackingCardQuery,
  ProductionTrackingAbnormalityDescriptionQuery,
  ProductionTrackingCardsCreatedResult,
  ProductionTrackingPersonnelSnapshot,
  ProductionTrackingReportQuery,
  ReopenProductionTrackingTaskPayload,
  ScanProductionTrackingCardPayload,
  VoidProductionTrackingAbnormalityPayload,
  VoidProductionTrackingCardPayload,
} from '@company/contracts';
import type { IdempotentCommandContext } from '../../../common/audit/audit.types.js';
import {
  IdempotencyExecutor,
  type IdempotencyResultCodec,
} from '../../../common/idempotency/idempotency-executor.js';
import { PersonnelService } from '../../identity/public.js';
import { AttachmentService } from '../../attachment/public.js';
import { ProductSnapshotQuery } from '../../product/public.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { ProductionTrackingRepository } from './ports/production-tracking.repository.js';
import { productionBatchResultCodec } from './idempotency/production-batch-result.codec.js';
import {
  trackingCardResultCodec,
  savedMarksResultCodec,
  trackingCardsCreatedResultCodec,
  trackingOutputResultCodec,
  trackingScanResultCodec,
} from './idempotency/production-tracking-result.codec.js';

@Injectable()
export class ProductionTrackingService {
  constructor(
    private readonly repository: ProductionTrackingRepository,
    private readonly personnel: PersonnelService,
    private readonly idempotency: IdempotencyExecutor,
    private readonly files: AttachmentService,
    private readonly products: ProductSnapshotQuery,
  ) {}

  list(query: ProductionTrackingCardQuery) {
    const keyword = normalizeTrackingCardNo(query.keyword ?? '') || undefined;
    return this.repository.list({
      ...query,
      keyword,
      exactCardNo: keyword && isCanonicalTrackingCardNo(keyword) ? keyword : undefined,
    });
  }
  get(cardId: string) {
    return this.repository.get(cardId);
  }
  itemMarks(query: ProductionTrackingItemMarkQuery) {
    return this.repository.itemMarks({
      ...query,
      cardNo: query.cardNo === undefined ? undefined : normalizeTrackingCardNo(query.cardNo),
      keyword: query.keyword?.trim() || undefined,
    });
  }
  itemMarkCodeAvailability(markCode: string) {
    const code = normalizeTrackingItemMarkCode(markCode);
    if (!TRACKING_ITEM_MARK_CODE_PATTERN.test(code))
      throw new ProductionDomainError('INVALID_INPUT', TRACKING_ITEM_MARK_CODE_ERROR_MESSAGE);
    return this.repository.itemMarkCodeAvailability(code);
  }
  itemMarkWorkspace(query: ProductionTrackingItemMarkWorkspaceQuery) {
    return this.repository.itemMarkWorkspace({
      ...query,
      cardNo: normalizeTrackingCardNo(query.cardNo ?? '') || undefined,
      keyword: query.keyword?.trim() || undefined,
    });
  }
  saveItemMarkWorkspace(
    batchId: string,
    payload: SaveProductionTrackingItemMarkWorkspacePayload,
    context: IdempotentCommandContext,
  ) {
    const body = {
      personnelId: payload.personnelId,
      reason: payload.reason?.trim() || '',
      changes: payload.changes.map((row) => ({
        ...row,
        markCode: row.markCode === null ? null : normalizeTrackingItemMarkCode(row.markCode),
      })),
    };
    return this.execute('item-mark.save', { batchId }, body, context, savedMarksResultCodec, () =>
      this.repository.withBatchTransaction(batchId, async () =>
        this.repository.saveItemMarkWorkspace(
          batchId,
          body,
          await this.person(body.personnelId),
          context,
        ),
      ),
    );
  }
  itemMark(cardId: string, markId: string) {
    return this.repository.itemMark(cardId, markId);
  }
  itemMarkCorrections(cardId: string, markId: string, query: PageQuery) {
    return this.repository.itemMarkCorrections(cardId, markId, query);
  }
  bindItemMark(
    cardId: string,
    payload: BindProductionTrackingItemMarkPayload,
    context: IdempotentCommandContext,
  ): Promise<ProductionTrackingCardDetail> {
    const body = {
      version: payload.version,
      personnelId: payload.personnelId,
      markCode: normalizeTrackingItemMarkCode(payload.markCode),
    };
    return this.execute('item-mark.bind', { cardId }, body, context, trackingCardResultCodec, () =>
      this.repository.withCardTransaction(cardId, false, async (id) =>
        this.repository.bindItemMark(id, body, await this.person(body.personnelId), context),
      ),
    );
  }
  cancelItemMark(
    cardId: string,
    markId: string,
    payload: CancelProductionTrackingItemMarkPayload,
    context: IdempotentCommandContext,
  ): Promise<ProductionTrackingCardDetail> {
    const body = { version: payload.version, reason: this.reason(payload.reason) };
    return this.execute(
      'item-mark.cancel',
      { cardId, markId },
      body,
      context,
      trackingCardResultCodec,
      () =>
        this.repository.withCardTransaction(cardId, false, (id) =>
          this.repository.cancelItemMark(id, markId, body, context),
        ),
    );
  }
  correctItemMark(
    cardId: string,
    markId: string,
    payload: CorrectProductionTrackingItemMarkPayload,
    context: IdempotentCommandContext,
  ): Promise<ProductionTrackingCardDetail> {
    const body = {
      version: payload.version,
      markCode: normalizeTrackingItemMarkCode(payload.markCode),
      reason: this.reason(payload.reason),
    };
    return this.execute(
      'item-mark.correct',
      { cardId, markId },
      body,
      context,
      trackingCardResultCodec,
      () =>
        this.repository.withCardTransaction(cardId, false, (id) =>
          this.repository.correctItemMark(id, markId, body, context),
        ),
    );
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
  async abnormalityDescriptionOptions(
    cardId: string,
    query: ProductionTrackingAbnormalityDescriptionQuery,
  ): Promise<PageResult<string>> {
    const processStepId = await this.abnormalityProcessId(cardId, query.stepRecordId);
    return this.repository.abnormalityDescriptionOptions(processStepId, {
      ...query,
      keyword: query.keyword?.trim() || undefined,
    });
  }

  create(
    batchId: string,
    payload: CreateProductionTrackingCardPayload,
    context: IdempotentCommandContext,
  ): Promise<ProductionTrackingCardDetail> {
    const body = {
      quantity: payload.quantity,
      personnelId: payload.personnelId,
      remark: payload.remark?.trim() || null,
    };
    return this.execute('create', { batchId }, body, context, trackingCardResultCodec, () =>
      this.repository.withBatchTransaction(batchId, async () =>
        this.repository.create(batchId, body, await this.person(body.personnelId), context),
      ),
    );
  }
  createBulk(
    batchId: string,
    payload: CreateProductionTrackingCardsPayload,
    context: IdempotentCommandContext,
  ): Promise<ProductionTrackingCardsCreatedResult> {
    const body = {
      totalQuantity: payload.totalQuantity,
      quantityPerCard: payload.quantityPerCard,
      personnelId: payload.personnelId,
      remark: payload.remark?.trim() || null,
    };
    return this.execute(
      'create-bulk',
      { batchId },
      body,
      context,
      trackingCardsCreatedResultCodec,
      () =>
        this.repository.withBatchTransaction(batchId, async () =>
          this.repository.createBulk(batchId, body, await this.person(body.personnelId), context),
        ),
    );
  }
  scan(payload: ScanProductionTrackingCardPayload, context: IdempotentCommandContext) {
    const body = { ...payload, cardNo: normalizeTrackingCardNo(payload.cardNo) };
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
    const labels = [...new Set(payload.descriptionLabels)];
    if (
      !labels.length ||
      labels.length > PRODUCTION_TRACKING_ABNORMALITY_LABEL_LIMIT ||
      labels.some(
        (label) =>
          !label.trim() ||
          Array.from(label).length > PRODUCTION_TRACKING_ABNORMALITY_LABEL_MAX_LENGTH,
      )
    )
      throw new ProductionDomainError('INVALID_INPUT', '请选择或填写有效的异常描述标签');
    // Preserve an exact historical candidate, including its whitespace. The repository
    // trims only new labels after checking the immutable dictionary across scopes.
    const body = {
      version: payload.version,
      stepRecordId: payload.stepRecordId,
      personnelId: payload.personnelId,
      affectedQuantity: payload.affectedQuantity,
      descriptionLabels: labels,
      resolution: payload.resolution,
      scrappedItemMarkIds: [...(payload.scrappedItemMarkIds ?? [])].sort(),
    };
    return this.execute(
      'abnormality.create',
      { cardId },
      body,
      context,
      trackingCardResultCodec,
      () =>
        this.repository.withCardTransaction(cardId, false, async (id) => {
          const processStepId = await this.abnormalityProcessId(id, body.stepRecordId);
          return this.repository.createAbnormality(
            id,
            body,
            processStepId,
            await this.person(body.personnelId),
            context,
          );
        }),
    );
  }
  handleAbnormality(
    cardId: string,
    abnormalityId: string,
    payload: HandleProductionTrackingAbnormalityPayload,
    context: IdempotentCommandContext,
  ) {
    let body: HandleProductionTrackingAbnormalityPayload;
    if (payload.resolution) body = this.simpleAbnormalityHandling(payload);
    else {
      body = {
        version: payload.version,
        personnelId: payload.personnelId,
        content: this.reason(payload.content ?? ''),
        repairedQuantity: payload.repairedQuantity,
        scrappedQuantity: payload.scrappedQuantity,
        scrapReferences: payload.scrapReferences?.map(({ handlingId, quantity }) => ({
          handlingId,
          quantity,
        })),
        ...(payload.scrappedItemMarkIds !== undefined
          ? { scrappedItemMarkIds: [...payload.scrappedItemMarkIds] }
          : {}),
      };
    }
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
  correctAbnormalityScrap(
    cardId: string,
    abnormalityId: string,
    payload: CorrectProductionTrackingAbnormalityScrapPayload,
    context: IdempotentCommandContext,
  ): Promise<ProductionTrackingCardDetail> {
    const body = {
      version: payload.version,
      cardVersion: payload.cardVersion,
      scrappedQuantity: payload.scrappedQuantity,
      scrappedItemMarkIds: [...payload.scrappedItemMarkIds].sort(),
      reason: this.reason(payload.reason),
    };
    return this.execute(
      'abnormality.scrap-correction',
      { cardId, abnormalityId },
      body,
      context,
      trackingCardResultCodec,
      () =>
        this.repository.withCardTransaction(cardId, false, (id) =>
          this.repository.correctAbnormalityScrap(id, abnormalityId, body, context),
        ),
    );
  }
  voidAbnormality(
    cardId: string,
    abnormalityId: string,
    payload: VoidProductionTrackingAbnormalityPayload,
    context: IdempotentCommandContext,
  ): Promise<ProductionTrackingCardDetail> {
    const body = {
      version: payload.version,
      cardVersion: payload.cardVersion,
      reason: this.reason(payload.reason),
    };
    return this.execute(
      'abnormality.void',
      { cardId, abnormalityId },
      body,
      context,
      trackingCardResultCodec,
      () =>
        this.repository.withCardTransaction(cardId, false, (id) =>
          this.repository.voidAbnormality(id, abnormalityId, body, context),
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
  private async abnormalityProcessId(
    cardId: string,
    stepRecordId?: string | null,
  ): Promise<string | null> {
    const step = await this.repository.abnormalityStepReference(cardId, stepRecordId);
    if (!step) return null;
    const processStepId = await this.products.getHistoricalRouteStepProcessId(step.routeStepId);
    if (!processStepId)
      throw new ProductionDomainError('CONFLICT', '异常关联工序的历史身份缺失，请联系管理员核对');
    return processStepId;
  }
  private simpleAbnormalityHandling(
    payload: HandleProductionTrackingAbnormalityPayload,
  ): HandleProductionTrackingAbnormalityPayload {
    if (
      payload.content !== undefined ||
      payload.repairedQuantity !== undefined ||
      payload.scrappedQuantity !== undefined ||
      payload.scrapReferences !== undefined
    )
      throw new ProductionDomainError('INVALID_INPUT', '返修或报废选择不能同时填写高级数量结算');
    return {
      version: payload.version,
      personnelId: payload.personnelId,
      resolution: payload.resolution,
      ...(payload.scrappedItemMarkIds !== undefined
        ? { scrappedItemMarkIds: [...payload.scrappedItemMarkIds] }
        : {}),
    };
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
