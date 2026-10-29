import { Injectable } from '@nestjs/common';
import type {
  CreatePurchaseOrderPayload,
  UpdatePurchaseOrderPayload,
  PlacePurchaseOrderPayload,
  CancelPurchaseOrderPayload,
  ClosePurchaseOrderLinePayload,
  ClosePurchaseOrderPayload,
  ReopenPurchaseOrderLinePayload,
  CreatePurchaseOrderSupplementPayload,
  PurchaseOrderCommandResult,
  PurchaseOrderQuery,
  PurchaseOrderLineReceiptRecordQuery,
  PurchaseOrderLineReceiptRecordPage,
  PurchaseExcessReceiptCandidateQuery,
  PurchaseExcessReceiptCandidate,
  PurchaseQualityReplacementCandidateQuery,
  PurchaseQualityReplacementCandidate,
  PageResult,
  RelatedPurchasesQuery,
  ProcurementDemandCandidateQuery,
  ProcurementDemandWorkOrderQuery,
  CorrectPurchaseOrderAmountsPayload,
} from '@company/contracts';
import type {
  CommandContext,
  IdempotentCommandContext,
} from '../../../common/audit/audit.types.js';
import { IdempotencyExecutor } from '../../../common/idempotency/idempotency-executor.js';
import { MaterialVariantQuery } from '../../product/public.js';
import { ProductionProcurementQuery } from '../../production/public.js';
import {
  normalizePurchaseDraft,
  normalizePurchaseLineAmount,
  normalizePurchaseAmountsCorrection,
} from '../domain/purchase-order.policy.js';
import { PurchaseOrderRepository } from './ports/purchase-order.repository.js';
import {
  CREATE_PURCHASE_ORDER_SCOPE,
  UPDATE_PURCHASE_ORDER_SCOPE,
  PLACE_PURCHASE_ORDER_SCOPE,
  CANCEL_PURCHASE_ORDER_SCOPE,
  CLOSE_PURCHASE_ORDER_LINE_SCOPE,
  REOPEN_PURCHASE_ORDER_LINE_SCOPE,
  CLOSE_PURCHASE_ORDER_SCOPE,
  CREATE_PURCHASE_ORDER_SUPPLEMENT_SCOPE,
  CORRECT_PURCHASE_ORDER_AMOUNTS_SCOPE,
} from './idempotency/procurement-idempotency-scopes.contract.js';
import { purchaseOrderResultCodec } from './idempotency/purchase-order-result.codec.js';
@Injectable()
export class PurchaseOrderService {
  constructor(
    private readonly repository: PurchaseOrderRepository,
    private readonly idempotency: IdempotencyExecutor,
    private readonly production: ProductionProcurementQuery,
    private readonly variants: MaterialVariantQuery,
  ) {}
  list(query: PurchaseOrderQuery) {
    return this.repository.list({
      ...query,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 10,
      keyword: query.keyword?.trim() || undefined,
    });
  }
  get(id: string) {
    return this.repository.get(id);
  }
  receiptRecords(
    id: string,
    query: PurchaseOrderLineReceiptRecordQuery,
  ): Promise<PurchaseOrderLineReceiptRecordPage> {
    return this.repository.receiptRecords(id, {
      ...query,
      keyword: query.keyword?.trim() || undefined,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 10,
    });
  }
  excessReceiptCandidates(
    id: string,
    query: PurchaseExcessReceiptCandidateQuery,
  ): Promise<PageResult<PurchaseExcessReceiptCandidate>> {
    return this.repository.excessReceiptCandidates(id, {
      ...query,
      keyword: query.keyword?.trim() || undefined,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 10,
    });
  }
  qualityReplacementCandidates(
    id: string,
    query: PurchaseQualityReplacementCandidateQuery,
  ): Promise<PageResult<PurchaseQualityReplacementCandidate>> {
    return this.repository.qualityReplacementCandidates(id, {
      ...query,
      keyword: query.keyword?.trim() || undefined,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 10,
    });
  }
  related(query: RelatedPurchasesQuery) {
    return this.repository.related({
      ...query,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 10,
    });
  }
  candidates(query: ProcurementDemandCandidateQuery) {
    return this.production.listCandidates({
      ...query,
      keyword: query.keyword?.trim() || undefined,
    });
  }
  workOrders(query: ProcurementDemandWorkOrderQuery) {
    return this.production.listWorkOrders({
      ...query,
      keyword: query.keyword?.trim() || undefined,
    });
  }
  async resolve(workOrderId: string, demandIds: string[]) {
    const rows = await this.production.resolveDemands({ demandIds });
    return rows.map((row) =>
      row.demand && row.demand.workOrderId !== workOrderId
        ? { ...row, eligible: false, blockedReason: '需求不属于所选工单' }
        : row,
    );
  }
  materialOptions(query: { keyword?: string; includeIds?: string[] }) {
    return this.variants.listPurchasableMaterials({
      keyword: query.keyword?.trim() || undefined,
      includeIds: query.includeIds,
    });
  }
  variantOptions(materialId: string) {
    return this.variants.listPurchasableByMaterials({ materialIds: [materialId] });
  }
  async create(
    payload: CreatePurchaseOrderPayload,
    context: IdempotentCommandContext,
  ): Promise<PurchaseOrderCommandResult> {
    const body = normalizePurchaseDraft(payload);
    const execution = await this.idempotency.execute({
      scope: CREATE_PURCHASE_ORDER_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { body },
      resultCodec: purchaseOrderResultCodec,
      handler: () => this.repository.create(body, auditContext(context)),
    });
    return execution.result;
  }
  async update(
    id: string,
    payload: UpdatePurchaseOrderPayload,
    context: IdempotentCommandContext,
  ): Promise<PurchaseOrderCommandResult> {
    const body = { ...normalizePurchaseDraft(payload), version: payload.version };
    const execution = await this.idempotency.execute({
      scope: UPDATE_PURCHASE_ORDER_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { id }, body },
      resultCodec: purchaseOrderResultCodec,
      handler: () => this.repository.update(id, body, auditContext(context)),
    });
    return execution.result;
  }
  async place(
    id: string,
    payload: PlacePurchaseOrderPayload,
    context: IdempotentCommandContext,
  ): Promise<PurchaseOrderCommandResult> {
    const body = { version: payload.version };
    const execution = await this.idempotency.execute({
      scope: PLACE_PURCHASE_ORDER_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { id }, body },
      resultCodec: purchaseOrderResultCodec,
      handler: () => this.repository.place(id, body.version, auditContext(context)),
    });
    return execution.result;
  }
  async cancel(
    id: string,
    payload: CancelPurchaseOrderPayload,
    context: IdempotentCommandContext,
  ): Promise<PurchaseOrderCommandResult> {
    const body = { version: payload.version, reason: payload.reason.trim() };
    const execution = await this.idempotency.execute({
      scope: CANCEL_PURCHASE_ORDER_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { id }, body },
      resultCodec: purchaseOrderResultCodec,
      handler: () => this.repository.cancel(id, body.version, body.reason, auditContext(context)),
    });
    return execution.result;
  }
  async closeLine(
    id: string,
    payload: ClosePurchaseOrderLinePayload,
    context: IdempotentCommandContext,
  ): Promise<PurchaseOrderCommandResult> {
    const body = { version: payload.version, reason: payload.reason.trim() };
    const execution = await this.idempotency.execute({
      scope: CLOSE_PURCHASE_ORDER_LINE_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { id }, body },
      resultCodec: purchaseOrderResultCodec,
      handler: () => this.repository.closeLine(id, body, auditContext(context)),
    });
    return execution.result;
  }
  async reopenLine(
    id: string,
    payload: ReopenPurchaseOrderLinePayload,
    context: IdempotentCommandContext,
  ): Promise<PurchaseOrderCommandResult> {
    const body = { version: payload.version, reason: payload.reason.trim() };
    const execution = await this.idempotency.execute({
      scope: REOPEN_PURCHASE_ORDER_LINE_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { id }, body },
      resultCodec: purchaseOrderResultCodec,
      handler: () => this.repository.reopenLine(id, body, auditContext(context)),
    });
    return execution.result;
  }
  async close(
    id: string,
    payload: ClosePurchaseOrderPayload,
    context: IdempotentCommandContext,
  ): Promise<PurchaseOrderCommandResult> {
    const body = { version: payload.version, reason: payload.reason.trim() };
    const execution = await this.idempotency.execute({
      scope: CLOSE_PURCHASE_ORDER_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { id }, body },
      resultCodec: purchaseOrderResultCodec,
      handler: () => this.repository.close(id, body, auditContext(context)),
    });
    return execution.result;
  }
  async correctAmounts(
    id: string,
    payload: CorrectPurchaseOrderAmountsPayload,
    context: IdempotentCommandContext,
  ): Promise<PurchaseOrderCommandResult> {
    const body = normalizePurchaseAmountsCorrection(payload);
    const execution = await this.idempotency.execute({
      scope: CORRECT_PURCHASE_ORDER_AMOUNTS_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { id }, body },
      resultCodec: purchaseOrderResultCodec,
      handler: () => this.repository.correctAmounts(id, body, auditContext(context)),
    });
    return execution.result;
  }
  async supplement(
    id: string,
    payload: CreatePurchaseOrderSupplementPayload,
    context: IdempotentCommandContext,
  ): Promise<PurchaseOrderCommandResult> {
    const body = {
      supplementReason: payload.supplementReason,
      items: payload.items.map((item) => {
        const amount = normalizePurchaseLineAmount(item);
        return {
          originOrderLineId: item.originOrderLineId,
          originReceiptLineId: item.originReceiptLineId,
          plannedQuantity: item.plannedQuantity,
          taxExclusiveAmount: amount.taxExclusiveAmount,
          taxInclusiveAmount: amount.taxInclusiveAmount,
          taxRatePercent: amount.taxRatePercent,
          manualTotalAmount: amount.manualTotalAmount,
          supplementEvidence: item.supplementEvidence.trim(),
        };
      }),
      remark: payload.remark?.trim() || null,
    };
    const execution = await this.idempotency.execute({
      scope: CREATE_PURCHASE_ORDER_SUPPLEMENT_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { id }, body },
      resultCodec: purchaseOrderResultCodec,
      handler: () => this.repository.supplement(id, body, auditContext(context)),
    });
    return execution.result;
  }
}
const auditContext = (context: IdempotentCommandContext): CommandContext => ({
  actorId: context.actorId,
  requestId: context.requestId,
  ip: context.ip,
  userAgent: context.userAgent,
});
