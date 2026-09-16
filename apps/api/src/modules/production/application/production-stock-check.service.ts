import { Injectable } from '@nestjs/common';
import type {
  CreateStockCheckPayload,
  PageResult,
  SaveStockCheckCountsPayload,
  StockCheckCandidateItem,
  StockCheckCandidateQuery,
  StockCheckOrderItem,
  StockCheckOrderQuery,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { IdentityDirectoryService } from '../../identity/public.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { ProductionStockCheckRepository } from './ports/production-stock-check.repository.js';

@Injectable()
export class ProductionStockCheckService {
  constructor(
    private readonly stockChecks: ProductionStockCheckRepository,
    private readonly identity: IdentityDirectoryService,
  ) {}

  async listStockChecks(query: StockCheckOrderQuery): Promise<PageResult<StockCheckOrderItem>> {
    const result = await this.stockChecks.listStockChecks(query);
    return { ...result, items: await this.enrichStockChecks(result.items) };
  }
  async getStockCheck(stockCheckId: string): Promise<StockCheckOrderItem> {
    return (await this.enrichStockChecks([await this.stockChecks.getStockCheck(stockCheckId)]))[0]!;
  }
  listStockCheckCandidates(
    query: StockCheckCandidateQuery,
  ): Promise<PageResult<StockCheckCandidateItem>> {
    return this.stockChecks.listStockCheckCandidates(query);
  }
  async createStockCheck(
    payload: CreateStockCheckPayload,
    context: CommandContext,
  ): Promise<StockCheckOrderItem> {
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
  ): Promise<StockCheckOrderItem> {
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
  async completeStockCheck(
    stockCheckId: string,
    version: number,
    context: CommandContext,
  ): Promise<StockCheckOrderItem> {
    const completed = await this.stockChecks.completeStockCheck(stockCheckId, version, context);
    return (await this.enrichStockChecks([completed]))[0]!;
  }
  async cancelStockCheck(
    stockCheckId: string,
    version: number,
    reason: string,
    context: CommandContext,
  ): Promise<StockCheckOrderItem> {
    const cancelled = await this.stockChecks.cancelStockCheck(
      stockCheckId,
      version,
      requireReason(reason),
      context,
    );
    return (await this.enrichStockChecks([cancelled]))[0]!;
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
const requireReason = (value: string): string => {
  const reason = clean(value);
  if (!reason) throw new ProductionDomainError('INVALID_INPUT', '取消原因不能为空');
  return reason;
};
const requireUnique = (values: string[], message: string): void => {
  if (new Set(values).size !== values.length)
    throw new ProductionDomainError('INVALID_INPUT', message);
};
