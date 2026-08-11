import { ref } from 'vue';
import type {
  AvailableItemBatchItem,
  CreateMaterialAllocationsPayload,
  CreateMaterialOutboundPayload,
  MaterialOutboundItem,
  ProductionMaterialDemandItem,
} from '@company/contracts';
import { productionApi } from '../../../api/production';
import { useIdempotentIntent } from '../../../composables/idempotency/useIdempotentIntent';

export const useProductionMaterials = () => {
  const batchId = ref<string | null>(null);
  const demands = ref<ProductionMaterialDemandItem[]>([]);
  const outbounds = ref<MaterialOutboundItem[]>([]);
  const availableItemBatches = ref<AvailableItemBatchItem[]>([]);
  const loadingDemands = ref(false);
  const loadingAvailable = ref(false);
  const loadingOutbounds = ref(false);
  const submitting = ref(false);
  const releasePendingIds = ref(new Set<string>());
  let demandRequest = 0;
  let availableRequest = 0;
  let outboundRequest = 0;
  const allocationIntent = useIdempotentIntent();
  const outboundIntent = useIdempotentIntent();

  const setBatch = (id: string): void => {
    if (batchId.value === id) return;
    batchId.value = id;
    demands.value = [];
    outbounds.value = [];
    availableItemBatches.value = [];
    allocationIntent.reset();
    outboundIntent.reset();
  };
  const loadDemands = async (): Promise<void> => {
    if (!batchId.value) return;
    const id = batchId.value;
    const token = ++demandRequest;
    loadingDemands.value = true;
    try {
      const result = await productionApi.listMaterialDemands(id);
      if (token === demandRequest && batchId.value === id) demands.value = result;
    } finally {
      if (token === demandRequest) loadingDemands.value = false;
    }
  };
  const loadAvailable = async (demandId: string): Promise<void> => {
    const token = ++availableRequest;
    loadingAvailable.value = true;
    try {
      const result = await productionApi.listAvailableItemBatches(demandId);
      if (token === availableRequest) availableItemBatches.value = result;
    } finally {
      if (token === availableRequest) loadingAvailable.value = false;
    }
  };
  const loadOutbounds = async (): Promise<void> => {
    if (!batchId.value) return;
    const id = batchId.value;
    const token = ++outboundRequest;
    loadingOutbounds.value = true;
    try {
      const result = await productionApi.listMaterialOutbounds(id);
      if (token === outboundRequest && batchId.value === id) outbounds.value = result;
    } finally {
      if (token === outboundRequest) loadingOutbounds.value = false;
    }
  };
  const allocate = async (payload: CreateMaterialAllocationsPayload): Promise<void> => {
    if (!batchId.value || submitting.value) return;
    const id = batchId.value;
    const normalized = {
      allocations: payload.allocations.map((line) => ({
        ...line,
        remark: line.remark?.trim() || null,
      })),
    };
    submitting.value = true;
    try {
      await allocationIntent.execute(
        {
          intentType: 'production.material-allocation.create',
          params: { batchId: id },
          query: {},
          body: normalized,
        },
        (key) => productionApi.createMaterialAllocations(id, normalized, key),
      );
      await loadDemands();
    } finally {
      submitting.value = false;
    }
  };
  const release = async (allocationId: string, version: number): Promise<void> => {
    if (!batchId.value || releasePendingIds.value.has(allocationId)) return;
    releasePendingIds.value = new Set(releasePendingIds.value).add(allocationId);
    try {
      await productionApi.releaseMaterialAllocation(batchId.value, allocationId, version);
      await loadDemands();
    } finally {
      const next = new Set(releasePendingIds.value);
      next.delete(allocationId);
      releasePendingIds.value = next;
    }
  };
  const outbound = async (payload: CreateMaterialOutboundPayload): Promise<void> => {
    if (!batchId.value || submitting.value) return;
    const id = batchId.value;
    const normalized = {
      details: payload.details.map((line) => ({ ...line })),
      remark: payload.remark?.trim() || null,
    };
    submitting.value = true;
    try {
      await outboundIntent.execute(
        {
          intentType: 'production.material-outbound.create',
          params: { batchId: id },
          query: {},
          body: normalized,
        },
        (key) => productionApi.createMaterialOutbound(id, normalized, key),
      );
      await Promise.all([loadDemands(), loadOutbounds()]);
    } finally {
      submitting.value = false;
    }
  };
  return {
    batchId,
    demands,
    outbounds,
    availableItemBatches,
    loadingDemands,
    loadingAvailable,
    loadingOutbounds,
    submitting,
    releasePendingIds,
    getAllocationIntentStatus: allocationIntent.getStatus,
    getOutboundIntentStatus: outboundIntent.getStatus,
    resetAllocationIntent: allocationIntent.reset,
    resetOutboundIntent: outboundIntent.reset,
    setBatch,
    loadDemands,
    loadAvailable,
    loadOutbounds,
    allocate,
    release,
    outbound,
  };
};
