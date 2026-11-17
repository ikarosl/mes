import type {
  InventoryBatchDetailItem,
  InventoryBatchItem,
  InventoryBatchQuery,
  PageResult,
} from '@company/contracts';

export abstract class InventoryInboundRepository {
  abstract listInventory(query: InventoryBatchQuery): Promise<PageResult<InventoryBatchItem>>;
  abstract getInventory(itemBatchId: string): Promise<InventoryBatchDetailItem>;
}
