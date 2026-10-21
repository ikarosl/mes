import type {
  InventoryBatchDetailItem,
  InventoryBatchItem,
  InventoryBatchQuery,
  PageResult,
  PurchaseInboundOrderItem,
  PurchaseInboundOrderQuery,
} from '@company/contracts';

export abstract class InventoryInboundRepository {
  abstract list(query: PurchaseInboundOrderQuery): Promise<PageResult<PurchaseInboundOrderItem>>;
  abstract get(inboundId: string): Promise<PurchaseInboundOrderItem>;
  abstract listInventory(query: InventoryBatchQuery): Promise<PageResult<InventoryBatchItem>>;
  abstract getInventory(itemBatchId: string): Promise<InventoryBatchDetailItem>;
}
