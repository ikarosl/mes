import type {
  PageResult,
  InventoryBatchDetailItem,
  InventoryBatchItem,
  InventoryBatchQuery,
  InventoryMaterialSupplyDemandItem,
  InventoryMaterialSupplyDemandQuery,
  InventoryMaterialDemandTraceItem,
  InventoryMaterialDemandTraceQuery,
} from '@company/contracts';
import { request } from './request';

export const productionInventoryApi = {
  listInventoryBatches: (
    params: InventoryBatchQuery,
    signal?: AbortSignal,
  ): Promise<PageResult<InventoryBatchItem>> =>
    request<PageResult<InventoryBatchItem>>({
      url: '/production/inventory-batches',
      params,
      signal,
      skipErrorHandling: true,
    }),

  listInventoryMaterialSupplyDemand: (
    params: InventoryMaterialSupplyDemandQuery,
  ): Promise<PageResult<InventoryMaterialSupplyDemandItem>> =>
    request<PageResult<InventoryMaterialSupplyDemandItem>>({
      url: '/production/inventory-material-supply-demand',
      params,
    }),

  listInventoryMaterialDemandTrace: (
    itemId: string,
    params: InventoryMaterialDemandTraceQuery,
  ): Promise<PageResult<InventoryMaterialDemandTraceItem>> =>
    request<PageResult<InventoryMaterialDemandTraceItem>>({
      url: `/production/inventory-material-supply-demand/${itemId}/demands`,
      params,
    }),

  getInventoryBatch: (id: string, signal?: AbortSignal): Promise<InventoryBatchDetailItem> =>
    request<InventoryBatchDetailItem>({
      url: `/production/inventory-batches/${id}`,
      signal,
      skipErrorHandling: true,
    }),
};
