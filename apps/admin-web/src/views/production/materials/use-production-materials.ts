import { ref } from 'vue';
import type {
  AvailableItemBatchItem,
  CreateMaterialAllocationsPayload,
  CreateMaterialOutboundPayload,
  MaterialOutboundItem,
  ProductionMaterialDemandItem,
} from '@company/contracts';
import { productionMaterialAllocationsApi } from '../../../api/production/material-allocations';
import { productionMaterialDemandsApi } from '../../../api/production/material-demands';
import { productionMaterialOutboundsApi } from '../../../api/production/material-outbounds';
import {
  useIdempotentIntent,
  type IdempotentIntentStatus,
} from '../../../composables/idempotency/useIdempotentIntent';
import { normalizeMaterialOutboundPayload } from '@company/utils';

export const useProductionMaterials = () => {
  const batchId = ref<string | null>(null);
  const demands = ref<ProductionMaterialDemandItem[]>([]);
  const outbounds = ref<MaterialOutboundItem[]>([]);
  const availableItemBatches = ref<AvailableItemBatchItem[]>([]);
  const loadingDemands = ref(false);
  const loadingAvailable = ref(false);
  const loadingOutbounds = ref(false);
  const demandsReady = ref(false);
  const availableReady = ref(false);
  const outboundsReady = ref(false);
  const submitting = ref(false);
  const releasePendingIds = ref(new Set<string>());
  let demandRequest = 0;
  let availableRequest = 0;
  let outboundRequest = 0;
  const invalidateDemandBasis = (): void => {
    ++demandRequest;
    ++availableRequest;
    loadingDemands.value = false;
    loadingAvailable.value = false;
    demandsReady.value = false;
    availableReady.value = false;
  };
  const allocationIntent = useIdempotentIntent();
  const outboundIntent = useIdempotentIntent();
  const allocationIntentStatus = ref<IdempotentIntentStatus>('idle');
  const outboundIntentStatus = ref<IdempotentIntentStatus>('idle');
  let allocationCommand: {
    batchId: string;
    payload: CreateMaterialAllocationsPayload;
  } | null = null;
  let outboundCommand: {
    batchId: string;
    payload: ReturnType<typeof normalizeMaterialOutboundPayload>;
  } | null = null;
  const resetAllocationIntent = (): void => {
    if (submitting.value) return;
    allocationIntent.reset();
    allocationIntentStatus.value = 'idle';
    allocationCommand = null;
  };
  const resetOutboundIntent = (): void => {
    if (submitting.value) return;
    outboundIntent.reset();
    outboundIntentStatus.value = 'idle';
    outboundCommand = null;
  };

  const setBatch = (id: string): boolean => {
    if (batchId.value === id) return true;
    if (
      submitting.value ||
      releasePendingIds.value.size > 0 ||
      allocationIntent.getStatus() !== 'idle' ||
      outboundIntent.getStatus() !== 'idle'
    )
      return false;
    ++demandRequest;
    ++availableRequest;
    ++outboundRequest;
    loadingDemands.value = false;
    loadingAvailable.value = false;
    loadingOutbounds.value = false;
    demandsReady.value = false;
    availableReady.value = false;
    outboundsReady.value = false;
    batchId.value = id;
    demands.value = [];
    outbounds.value = [];
    availableItemBatches.value = [];
    resetAllocationIntent();
    resetOutboundIntent();
    return true;
  };
  const loadDemands = async (): Promise<void> => {
    if (!batchId.value) return;
    const id = batchId.value;
    const token = ++demandRequest;
    loadingDemands.value = true;
    demandsReady.value = false;
    try {
      const result = await productionMaterialDemandsApi.listMaterialDemands(id);
      if (token === demandRequest && batchId.value === id) {
        demands.value = result;
        demandsReady.value = true;
      }
    } finally {
      if (token === demandRequest) loadingDemands.value = false;
    }
  };
  const loadAvailable = async (demandId: string): Promise<void> => {
    const token = ++availableRequest;
    loadingAvailable.value = true;
    availableReady.value = false;
    try {
      const result = await productionMaterialAllocationsApi.listAvailableItemBatches(demandId);
      if (token === availableRequest) {
        availableItemBatches.value = result;
        availableReady.value = true;
      }
    } finally {
      if (token === availableRequest) loadingAvailable.value = false;
    }
  };
  const loadOutbounds = async (): Promise<void> => {
    if (!batchId.value) return;
    const id = batchId.value;
    const token = ++outboundRequest;
    loadingOutbounds.value = true;
    outboundsReady.value = false;
    try {
      const result = await productionMaterialOutboundsApi.listMaterialOutbounds(id);
      if (token === outboundRequest && batchId.value === id) {
        outbounds.value = result;
        outboundsReady.value = true;
      }
    } finally {
      if (token === outboundRequest) loadingOutbounds.value = false;
    }
  };
  const allocate = async (payload?: CreateMaterialAllocationsPayload): Promise<boolean> => {
    if (!batchId.value || submitting.value || releasePendingIds.value.size > 0) return false;
    const id = batchId.value;
    if (allocationIntent.getStatus() === 'idle' && payload)
      allocationCommand = {
        batchId: id,
        payload: {
          allocations: payload.allocations.map((line) => ({
            ...line,
            remark: line.remark?.trim() || null,
          })),
        },
      };
    const command = allocationCommand;
    if (!command) throw new Error('原物料分配内容缺失，请先核对分配记录');
    if (command.batchId !== id) throw new Error('请先核对原任务的物料分配结果，再切换任务');
    submitting.value = true;
    try {
      await allocationIntent.execute(
        {
          intentType: 'production.material-allocation.create',
          params: { batchId: command.batchId },
          query: {},
          body: command.payload,
        },
        (key) =>
          productionMaterialAllocationsApi.createMaterialAllocations(
            command.batchId,
            command.payload,
            key,
          ),
      );
      allocationCommand = null;
      invalidateDemandBasis();
      return true;
    } catch (error) {
      if (allocationIntent.getStatus() === 'idle') allocationCommand = null;
      throw error;
    } finally {
      allocationIntentStatus.value = allocationIntent.getStatus();
      submitting.value = false;
    }
  };
  const release = async (allocationId: string, version: number): Promise<boolean> => {
    if (!batchId.value || submitting.value || releasePendingIds.value.has(allocationId))
      return false;
    releasePendingIds.value = new Set(releasePendingIds.value).add(allocationId);
    try {
      await productionMaterialAllocationsApi.releaseMaterialAllocation(
        batchId.value,
        allocationId,
        version,
      );
      invalidateDemandBasis();
      return true;
    } finally {
      const next = new Set(releasePendingIds.value);
      next.delete(allocationId);
      releasePendingIds.value = next;
    }
  };
  const outbound = async (payload?: CreateMaterialOutboundPayload): Promise<boolean> => {
    if (!batchId.value || submitting.value || releasePendingIds.value.size > 0) return false;
    const id = batchId.value;
    if (outboundIntent.getStatus() === 'idle' && payload)
      outboundCommand = { batchId: id, payload: normalizeMaterialOutboundPayload(payload) };
    const command = outboundCommand;
    if (!command) throw new Error('原领料出库内容缺失，请先核对出库单列表');
    if (command.batchId !== id) throw new Error('请先核对原任务的领料出库结果，再切换任务');
    submitting.value = true;
    try {
      await outboundIntent.execute(
        {
          intentType: 'production.material-outbound.create',
          params: { batchId: command.batchId },
          query: {},
          body: command.payload,
        },
        (key) =>
          productionMaterialOutboundsApi.createMaterialOutbound(
            command.batchId,
            command.payload,
            key,
          ),
      );
      outboundCommand = null;
      invalidateDemandBasis();
      ++outboundRequest;
      loadingOutbounds.value = false;
      outboundsReady.value = false;
      return true;
    } catch (error) {
      if (outboundIntent.getStatus() === 'idle') outboundCommand = null;
      throw error;
    } finally {
      outboundIntentStatus.value = outboundIntent.getStatus();
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
    demandsReady,
    availableReady,
    outboundsReady,
    submitting,
    releasePendingIds,
    allocationIntentStatus,
    outboundIntentStatus,
    getAllocationIntentStatus: allocationIntent.getStatus,
    getOutboundIntentStatus: outboundIntent.getStatus,
    resetAllocationIntent,
    resetOutboundIntent,
    setBatch,
    loadDemands,
    loadAvailable,
    loadOutbounds,
    allocate,
    release,
    outbound,
  };
};
