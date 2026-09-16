import { Injectable } from '@nestjs/common';
import type {
  CreateReturnOrderPayload,
  PageResult,
  ReturnOrderBatchOption,
  ReturnOrderCandidateItem,
  ReturnOrderItem,
  ReturnOrderQuery,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { IdentityDirectoryService } from '../../identity/public.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { ProductionReturnRepository } from './ports/production-return.repository.js';

@Injectable()
export class ProductionReturnService {
  constructor(
    private readonly returns: ProductionReturnRepository,
    private readonly identity: IdentityDirectoryService,
  ) {}

  async listReturnOrders(query: ReturnOrderQuery): Promise<PageResult<ReturnOrderItem>> {
    const result = await this.returns.listReturnOrders(query);
    return { ...result, items: await this.enrichReturns(result.items) };
  }
  async getReturnOrder(returnId: string): Promise<ReturnOrderItem> {
    return (await this.enrichReturns([await this.returns.getReturnOrder(returnId)]))[0]!;
  }
  listReturnBatchOptions(): Promise<ReturnOrderBatchOption[]> {
    return this.returns.listReturnBatchOptions();
  }
  listReturnCandidates(batchId: string): Promise<ReturnOrderCandidateItem[]> {
    return this.returns.listReturnCandidates(batchId);
  }
  async createReturnOrder(
    payload: CreateReturnOrderPayload,
    context: CommandContext,
  ): Promise<ReturnOrderItem> {
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
  async confirmReturnOrder(
    returnId: string,
    version: number,
    context: CommandContext,
  ): Promise<ReturnOrderItem> {
    const item = await this.returns.confirmReturnOrder(returnId, version, context);
    return (await this.enrichReturns([item]))[0]!;
  }
  async cancelReturnOrder(
    returnId: string,
    version: number,
    reason: string,
    context: CommandContext,
  ): Promise<ReturnOrderItem> {
    const item = await this.returns.cancelReturnOrder(
      returnId,
      version,
      requireReason(reason),
      context,
    );
    return (await this.enrichReturns([item]))[0]!;
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
