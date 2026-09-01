import type {
  CreatePurchaseInboundPayload,
  InventoryBatchDetailItem,
  InventoryBatchItem,
  InventoryBatchQuery,
  PageResult,
  PurchaseInboundOrderItem,
  PurchaseInboundOrderQuery,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';

export interface PurchaseInboundItemSnapshot {
  id: string;
  itemCode: string;
  productName: string;
  unit: string;
  itemKind: 'material' | 'semi_finished' | 'finished_product';
}

export abstract class ProductionInboundRepository {
  abstract list(query: PurchaseInboundOrderQuery): Promise<PageResult<PurchaseInboundOrderItem>>;
  abstract get(inboundId: string): Promise<PurchaseInboundOrderItem>;
  abstract create(
    payload: CreatePurchaseInboundPayload,
    snapshots: PurchaseInboundItemSnapshot[],
    context: CommandContext,
  ): Promise<PurchaseInboundOrderItem>;
  abstract confirm(
    inboundId: string,
    version: number,
    context: CommandContext,
  ): Promise<PurchaseInboundOrderItem>;
  abstract cancel(
    inboundId: string,
    version: number,
    reason: string,
    context: CommandContext,
  ): Promise<PurchaseInboundOrderItem>;
  abstract listInventory(query: InventoryBatchQuery): Promise<PageResult<InventoryBatchItem>>;
  abstract getInventory(itemBatchId: string): Promise<InventoryBatchDetailItem>;
}
