import type {
  CreateMaterialAllocationsPayload,
  AvailableItemBatchItem,
  MaterialAllocationCommandResult,
  ProductionMaterialAllocationItem,
} from '@company/contracts';
import { IDEMPOTENCY_KEY_HEADER } from '@company/request';
import { request } from './request';

export const productionMaterialAllocationsApi = {
  listAvailableItemBatches: (demandId: string): Promise<AvailableItemBatchItem[]> =>
    request<AvailableItemBatchItem[]>({
      url: `/production/material-demands/${demandId}/available-item-batches`,
    }),

  createMaterialAllocations: (
    batchId: string,
    data: CreateMaterialAllocationsPayload,
    idempotencyKey: string,
  ): Promise<MaterialAllocationCommandResult> =>
    request<MaterialAllocationCommandResult>({
      url: `/production/batches/${batchId}/material-allocations`,
      method: 'POST',
      data,
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
    }),

  releaseMaterialAllocation: (
    batchId: string,
    allocationId: string,
    version: number,
  ): Promise<ProductionMaterialAllocationItem> =>
    request<ProductionMaterialAllocationItem>({
      url: `/production/batches/${batchId}/material-allocations/${allocationId}/actions/release`,
      method: 'POST',
      data: { version },
    }),
};
