import { Injectable } from '@nestjs/common';
import type {
  CreateReturnOrderPayload,
  CreateStockCheckPayload,
  ReturnOrderItem,
  ReturnOrderQuery,
  SaveStockCheckCountsPayload,
  StockCheckCandidateQuery,
  StockCheckOrderItem,
  StockCheckOrderQuery,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { IdentityDirectoryService } from '../../identity/public.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { ProductionInventoryRepository } from './ports/production-inventory.repository.js';

@Injectable()
export class ProductionInventoryService {
  constructor(
    private readonly inventory: ProductionInventoryRepository,
    private readonly identity: IdentityDirectoryService,
  ) {}

  async listReturnOrders(query: ReturnOrderQuery) {
    const result = await this.inventory.listReturnOrders(query);
    return { ...result, items: await this.enrichReturns(result.items) };
  }
  async getReturnOrder(returnId: string) {
    return (await this.enrichReturns([await this.inventory.getReturnOrder(returnId)]))[0]!;
  }
  listReturnBatchOptions() {
    return this.inventory.listReturnBatchOptions();
  }
  listReturnCandidates(batchId: string) {
    return this.inventory.listReturnCandidates(batchId);
  }
  async createReturnOrder(payload: CreateReturnOrderPayload, context: CommandContext) {
    requireUnique(
      payload.details.map((line) => line.allocationId),
      '同一退料单不能重复选择分配行',
    );
    const created = await this.inventory.createReturnOrder(
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
    const item = await this.inventory.confirmReturnOrder(returnId, version, context);
    return (await this.enrichReturns([item]))[0]!;
  }
  async cancelReturnOrder(returnId: string, version: number, context: CommandContext) {
    const item = await this.inventory.cancelReturnOrder(returnId, version, context);
    return (await this.enrichReturns([item]))[0]!;
  }

  async listStockChecks(query: StockCheckOrderQuery) {
    const result = await this.inventory.listStockChecks(query);
    return { ...result, items: await this.enrichStockChecks(result.items) };
  }
  async getStockCheck(stockCheckId: string) {
    return (await this.enrichStockChecks([await this.inventory.getStockCheck(stockCheckId)]))[0]!;
  }
  listStockCheckCandidates(query: StockCheckCandidateQuery) {
    return this.inventory.listStockCheckCandidates(query);
  }
  async createStockCheck(payload: CreateStockCheckPayload, context: CommandContext) {
    requireUnique(
      payload.details.map((line) => `${line.itemBatchId}:${line.stockStatus}`),
      '同一盘点单不能重复选择库存批次与状态',
    );
    const created = await this.inventory.createStockCheck(
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
    const saved = await this.inventory.saveStockCheckCounts(
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
    const completed = await this.inventory.completeStockCheck(stockCheckId, version, context);
    return (await this.enrichStockChecks([completed]))[0]!;
  }
  async cancelStockCheck(stockCheckId: string, version: number, context: CommandContext) {
    const cancelled = await this.inventory.cancelStockCheck(stockCheckId, version, context);
    return (await this.enrichStockChecks([cancelled]))[0]!;
  }

  private async enrichReturns(items: ReturnOrderItem[]): Promise<ReturnOrderItem[]> {
    const names = await this.userNames(
      items.flatMap((item) => [item.operatorId, item.createdById]),
    );
    return items.map((item) => ({
      ...item,
      operatorName: item.operatorId ? (names.get(item.operatorId) ?? null) : null,
      createdByName: names.get(item.createdById) ?? null,
    }));
  }
  private async enrichStockChecks(items: StockCheckOrderItem[]): Promise<StockCheckOrderItem[]> {
    const names = await this.userNames(
      items.flatMap((item) => [item.operatorId, item.createdById]),
    );
    return items.map((item) => ({
      ...item,
      operatorName: item.operatorId ? (names.get(item.operatorId) ?? null) : null,
      createdByName: names.get(item.createdById) ?? null,
    }));
  }
  private async userNames(ids: Array<string | null>): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    const users = await this.identity.listUserReferencesByIds(unique);
    return new Map(users.map((user) => [user.id, user.displayName]));
  }
}

const clean = (value: string | null | undefined): string | null => value?.trim() || null;
const requireUnique = (values: string[], message: string): void => {
  if (new Set(values).size !== values.length)
    throw new ProductionDomainError('INVALID_INPUT', message);
};
