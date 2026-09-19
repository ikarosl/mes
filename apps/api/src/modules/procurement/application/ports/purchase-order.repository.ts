import type {
  CreatePurchaseOrderPayload,
  UpdatePurchaseOrderPayload,
  PurchaseOrderQuery,
  PurchaseOrderItem,
  PurchaseOrderDetail,
  PageResult,
  RelatedPurchasesQuery,
  RelatedPurchasesResult,
  PurchaseOrderCommandResult,
  CreatePurchaseOrderSupplementPayload,
  ClosePurchaseOrderLinePayload,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';

export abstract class PurchaseOrderRepository {
  abstract list(
    query: PurchaseOrderQuery & { page: number; pageSize: number },
  ): Promise<PageResult<PurchaseOrderItem>>;
  abstract get(id: string): Promise<PurchaseOrderDetail>;
  abstract related(
    query: RelatedPurchasesQuery & { page: number; pageSize: number },
  ): Promise<RelatedPurchasesResult>;
  abstract create(
    payload: CreatePurchaseOrderPayload,
    context: CommandContext,
  ): Promise<PurchaseOrderCommandResult>;
  abstract update(
    id: string,
    payload: UpdatePurchaseOrderPayload,
    context: CommandContext,
  ): Promise<PurchaseOrderCommandResult>;
  abstract place(
    id: string,
    version: number,
    context: CommandContext,
  ): Promise<PurchaseOrderCommandResult>;
  abstract cancel(
    id: string,
    version: number,
    reason: string,
    context: CommandContext,
  ): Promise<PurchaseOrderCommandResult>;
  abstract closeLine(
    id: string,
    payload: ClosePurchaseOrderLinePayload,
    context: CommandContext,
  ): Promise<PurchaseOrderCommandResult>;
  abstract supplement(
    id: string,
    payload: CreatePurchaseOrderSupplementPayload,
    context: CommandContext,
  ): Promise<PurchaseOrderCommandResult>;
}
