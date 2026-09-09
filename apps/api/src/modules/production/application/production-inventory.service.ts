import { Injectable } from '@nestjs/common';
import type {
  CreateReturnOrderPayload,
  CreateStockCheckPayload,
  CreateMaterialLossPayload,
  MaterialLossItem,
  MaterialLossQuery,
  ReturnOrderItem,
  ReturnOrderQuery,
  SaveStockCheckCountsPayload,
  StockCheckCandidateQuery,
  StockCheckOrderItem,
  StockCheckOrderQuery,
} from '@company/contracts';
import type {
  CommandContext,
  IdempotentCommandContext,
} from '../../../common/audit/audit.types.js';
import { IdempotencyExecutor } from '../../../common/idempotency/idempotency-executor.js';
import { IdentityDirectoryService } from '../../identity/public.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { CONFIRM_MATERIAL_LOSS_IDEMPOTENCY_SCOPE } from './idempotency/production-idempotency-scopes.contract.js';
import { CREATE_MATERIAL_LOSS_IDEMPOTENCY_SCOPE } from './idempotency/production-idempotency-scopes.contract.js';
import {
  confirmMaterialLossResultCodec,
  createMaterialLossResultCodec,
} from './idempotency/production-material-loss-result.codec.js';
import { ProductionMaterialLossRepository } from './ports/production-material-loss.repository.js';
import { ProductionReturnRepository } from './ports/production-return.repository.js';
import { ProductionStockCheckRepository } from './ports/production-stock-check.repository.js';

@Injectable()
export class ProductionInventoryService {
  constructor(
    private readonly materialLosses: ProductionMaterialLossRepository,
    private readonly returns: ProductionReturnRepository,
    private readonly stockChecks: ProductionStockCheckRepository,
    private readonly identity: IdentityDirectoryService,
    private readonly idempotency: IdempotencyExecutor,
  ) {}

  async listMaterialLosses(query: MaterialLossQuery) {
    const result = await this.materialLosses.listMaterialLosses(query);
    return { ...result, items: await this.enrichMaterialLosses(result.items) };
  }
  async getMaterialLoss(scrapId: string) {
    return (
      await this.enrichMaterialLosses([await this.materialLosses.getMaterialLoss(scrapId)])
    )[0]!;
  }
  listMaterialLossBatchOptions() {
    return this.materialLosses.listMaterialLossBatchOptions();
  }
  listMaterialLossCandidates(batchId: string) {
    return this.materialLosses.listMaterialLossCandidates(batchId);
  }
  async createMaterialLoss(payload: CreateMaterialLossPayload, context: IdempotentCommandContext) {
    const reasonType = payload.reasonType.trim();
    if (!reasonType) throw new ProductionDomainError('INVALID_INPUT', '损耗原因不能为空');
    const normalized = { ...payload, reasonType, remark: clean(payload.remark) };
    const execution = await this.idempotency.execute({
      scope: CREATE_MATERIAL_LOSS_IDEMPOTENCY_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { body: normalized },
      resultCodec: createMaterialLossResultCodec,
      handler: async () => {
        const item = await this.materialLosses.createMaterialLoss(
          normalized,
          toCommandContext(context),
        );
        return (await this.enrichMaterialLosses([item]))[0]!;
      },
    });
    return execution.result;
  }
  async confirmMaterialLoss(scrapId: string, version: number, context: IdempotentCommandContext) {
    const execution = await this.idempotency.execute({
      scope: CONFIRM_MATERIAL_LOSS_IDEMPOTENCY_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { scrapId }, body: { version } },
      resultCodec: confirmMaterialLossResultCodec,
      handler: async () => {
        const item = await this.materialLosses.confirmMaterialLoss(
          scrapId,
          version,
          toCommandContext(context),
        );
        return (await this.enrichMaterialLosses([item]))[0]!;
      },
    });
    return execution.result;
  }
  async cancelMaterialLoss(
    scrapId: string,
    version: number,
    reason: string,
    context: CommandContext,
  ) {
    const item = await this.materialLosses.cancelMaterialLoss(
      scrapId,
      version,
      requireReason(reason),
      context,
    );
    return (await this.enrichMaterialLosses([item]))[0]!;
  }

  async listReturnOrders(query: ReturnOrderQuery) {
    const result = await this.returns.listReturnOrders(query);
    return { ...result, items: await this.enrichReturns(result.items) };
  }
  async getReturnOrder(returnId: string) {
    return (await this.enrichReturns([await this.returns.getReturnOrder(returnId)]))[0]!;
  }
  listReturnBatchOptions() {
    return this.returns.listReturnBatchOptions();
  }
  listReturnCandidates(batchId: string) {
    return this.returns.listReturnCandidates(batchId);
  }
  async createReturnOrder(payload: CreateReturnOrderPayload, context: CommandContext) {
    requireUnique(
      payload.details.map((line) => line.allocationId),
      '同一退料单不能重复选择分配行',
    );
    const created = await this.returns.createReturnOrder(
      {
        productionBatchId: payload.productionBatchId,
        remark: clean(payload.remark),
        details: payload.details.map((line) => ({
          allocationId: line.allocationId,
          returnQuantity: line.returnQuantity,
          remark: clean(line.remark),
        })),
      },
      context,
    );
    return (await this.enrichReturns([created]))[0]!;
  }
  async confirmReturnOrder(returnId: string, version: number, context: CommandContext) {
    const item = await this.returns.confirmReturnOrder(returnId, version, context);
    return (await this.enrichReturns([item]))[0]!;
  }
  async cancelReturnOrder(
    returnId: string,
    version: number,
    reason: string,
    context: CommandContext,
  ) {
    const item = await this.returns.cancelReturnOrder(
      returnId,
      version,
      requireReason(reason),
      context,
    );
    return (await this.enrichReturns([item]))[0]!;
  }

  async listStockChecks(query: StockCheckOrderQuery) {
    const result = await this.stockChecks.listStockChecks(query);
    return { ...result, items: await this.enrichStockChecks(result.items) };
  }
  async getStockCheck(stockCheckId: string) {
    return (await this.enrichStockChecks([await this.stockChecks.getStockCheck(stockCheckId)]))[0]!;
  }
  listStockCheckCandidates(query: StockCheckCandidateQuery) {
    return this.stockChecks.listStockCheckCandidates(query);
  }
  async createStockCheck(payload: CreateStockCheckPayload, context: CommandContext) {
    requireUnique(
      payload.details.map((line) => `${line.itemBatchId}:${line.stockStatus}`),
      '同一盘点单不能重复选择库存批次与状态',
    );
    const created = await this.stockChecks.createStockCheck(
      { checkNo: clean(payload.checkNo), remark: clean(payload.remark), details: payload.details },
      context,
    );
    return (await this.enrichStockChecks([created]))[0]!;
  }
  async saveStockCheckCounts(
    stockCheckId: string,
    payload: SaveStockCheckCountsPayload,
    context: CommandContext,
  ) {
    requireUnique(
      payload.details.map((line) => line.detailId),
      '盘点明细不能重复提交',
    );
    const saved = await this.stockChecks.saveStockCheckCounts(
      stockCheckId,
      {
        version: payload.version,
        details: payload.details.map((line) => ({
          detailId: line.detailId,
          actualQuantity: line.actualQuantity,
          remark: clean(line.remark),
        })),
      },
      context,
    );
    return (await this.enrichStockChecks([saved]))[0]!;
  }
  async completeStockCheck(stockCheckId: string, version: number, context: CommandContext) {
    const completed = await this.stockChecks.completeStockCheck(stockCheckId, version, context);
    return (await this.enrichStockChecks([completed]))[0]!;
  }
  async cancelStockCheck(
    stockCheckId: string,
    version: number,
    reason: string,
    context: CommandContext,
  ) {
    const cancelled = await this.stockChecks.cancelStockCheck(
      stockCheckId,
      version,
      requireReason(reason),
      context,
    );
    return (await this.enrichStockChecks([cancelled]))[0]!;
  }

  private async enrichReturns(items: ReturnOrderItem[]): Promise<ReturnOrderItem[]> {
    const names = await this.userNames(
      items.flatMap((item) => [item.operatorId, item.createdById, item.cancelledById]),
    );
    return items.map((item) => ({
      ...item,
      operatorName: item.operatorId ? (names.get(item.operatorId) ?? null) : null,
      createdByName: names.get(item.createdById) ?? null,
      cancelledByName: item.cancelledById ? (names.get(item.cancelledById) ?? null) : null,
    }));
  }
  private async enrichMaterialLosses(items: MaterialLossItem[]): Promise<MaterialLossItem[]> {
    const names = await this.userNames(
      items.flatMap((item) => [item.confirmedById, item.createdById, item.cancelledById]),
    );
    return items.map((item) => ({
      ...item,
      confirmedByName: item.confirmedById ? (names.get(item.confirmedById) ?? null) : null,
      createdByName: names.get(item.createdById) ?? null,
      cancelledByName: item.cancelledById ? (names.get(item.cancelledById) ?? null) : null,
    }));
  }
  private async enrichStockChecks(items: StockCheckOrderItem[]): Promise<StockCheckOrderItem[]> {
    const names = await this.userNames(
      items.flatMap((item) => [item.operatorId, item.createdById, item.cancelledById]),
    );
    return items.map((item) => ({
      ...item,
      operatorName: item.operatorId ? (names.get(item.operatorId) ?? null) : null,
      createdByName: names.get(item.createdById) ?? null,
      cancelledByName: item.cancelledById ? (names.get(item.cancelledById) ?? null) : null,
    }));
  }
  private async userNames(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    const users = await this.identity.listUserReferencesByIds(unique);
    return new Map(users.map((user) => [user.id, user.displayName]));
  }
}

const clean = (value: string | null | undefined): string | null => value?.trim() || null;
const toCommandContext = (context: CommandContext): CommandContext => ({
  actorId: context.actorId,
  requestId: context.requestId,
  ip: context.ip,
  userAgent: context.userAgent,
});
const requireReason = (value: string): string => {
  const reason = clean(value);
  if (!reason) throw new ProductionDomainError('INVALID_INPUT', '取消原因不能为空');
  return reason;
};
const requireUnique = (values: string[], message: string): void => {
  if (new Set(values).size !== values.length)
    throw new ProductionDomainError('INVALID_INPUT', message);
};
