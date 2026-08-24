import { ref } from 'vue';
import type {
  CreateMaterialOutboundPayload,
  MaterialOutboundBatchOption,
  MaterialOutboundCandidateItem,
  MaterialOutboundItem,
  MaterialOutboundQuery,
} from '@company/contracts';
import { normalizeMaterialOutboundPayload } from '@company/utils';
import { productionApi } from '../../../api/production';
import { useIdempotentIntent } from '../../../composables/idempotency/useIdempotentIntent';

export const useMaterialOutboundOrders = () => {
  const rows = ref<MaterialOutboundItem[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const detail = ref<MaterialOutboundItem | null>(null);
  const detailLoading = ref(false);
  const batchOptions = ref<MaterialOutboundBatchOption[]>([]);
  const optionLoading = ref(false);
  const candidates = ref<MaterialOutboundCandidateItem[]>([]);
  const candidateLoading = ref(false);
  const pendingKeys = ref(new Set<string>());
  const createIntent = useIdempotentIntent();
  const confirmIntents = new Map<string, ReturnType<typeof useIdempotentIntent>>();
  let listRequest = 0;
  let detailRequest = 0;
  let candidateRequest = 0;

  const load = async (query: MaterialOutboundQuery): Promise<void> => {
    const token = ++listRequest;
    loading.value = true;
    try {
      const result = await productionApi.listMaterialOutboundOrders(query);
      if (token === listRequest) {
        rows.value = result.items;
        total.value = result.total;
      }
    } finally {
      if (token === listRequest) loading.value = false;
    }
  };

  const loadDetail = async (outboundId: string): Promise<MaterialOutboundItem> => {
    const token = ++detailRequest;
    detailLoading.value = true;
    try {
      const result = await productionApi.getMaterialOutbound(outboundId);
      if (token === detailRequest) detail.value = result;
      return result;
    } finally {
      if (token === detailRequest) detailLoading.value = false;
    }
  };

  const loadBatchOptions = async (): Promise<void> => {
    optionLoading.value = true;
    try {
      batchOptions.value = await productionApi.listMaterialOutboundBatchOptions();
    } finally {
      optionLoading.value = false;
    }
  };

  const loadCandidates = async (batchId: string): Promise<void> => {
    const token = ++candidateRequest;
    candidateLoading.value = true;
    candidates.value = [];
    try {
      const result = await productionApi.listMaterialOutboundCandidates(batchId);
      if (token === candidateRequest) candidates.value = result;
    } finally {
      if (token === candidateRequest) candidateLoading.value = false;
    }
  };

  const create = async (
    batchId: string,
    payload: CreateMaterialOutboundPayload,
  ): Promise<MaterialOutboundItem> => {
    const normalized = normalizeMaterialOutboundPayload(payload);
    const result = await createIntent.execute(
      {
        intentType: 'production.material-outbound.create',
        params: { batchId },
        query: {},
        body: normalized,
      },
      (key) => productionApi.createMaterialOutbound(batchId, normalized, key),
    );
    return result.outbound;
  };

  const confirm = async (row: MaterialOutboundItem): Promise<MaterialOutboundItem> => {
    const pendingKey = `confirm:${row.outboundId}`;
    if (pendingKeys.value.has(pendingKey)) return row;
    pendingKeys.value = new Set(pendingKeys.value).add(pendingKey);
    const intent = confirmIntents.get(row.outboundId) ?? useIdempotentIntent();
    confirmIntents.set(row.outboundId, intent);
    try {
      const result = await intent.execute(
        {
          intentType: 'production.material-outbound.confirm',
          params: { outboundId: row.outboundId },
          query: {},
          body: { version: row.version },
        },
        (key) => productionApi.confirmMaterialOutbound(row.outboundId, row.version, key),
      );
      confirmIntents.delete(row.outboundId);
      return result.outbound;
    } finally {
      removePending(pendingKey);
    }
  };

  const cancel = async (
    row: MaterialOutboundItem,
    reason: string,
  ): Promise<MaterialOutboundItem> => {
    const pendingKey = `cancel:${row.outboundId}`;
    if (pendingKeys.value.has(pendingKey)) return row;
    pendingKeys.value = new Set(pendingKeys.value).add(pendingKey);
    try {
      return await productionApi.cancelMaterialOutbound(row.outboundId, {
        version: row.version,
        reason: reason.trim(),
      });
    } finally {
      removePending(pendingKey);
    }
  };

  const removePending = (key: string): void => {
    const next = new Set(pendingKeys.value);
    next.delete(key);
    pendingKeys.value = next;
  };

  return {
    rows,
    total,
    loading,
    detail,
    detailLoading,
    batchOptions,
    optionLoading,
    candidates,
    candidateLoading,
    pendingKeys,
    getCreateIntentStatus: createIntent.getStatus,
    resetCreateIntent: createIntent.reset,
    load,
    loadDetail,
    loadBatchOptions,
    loadCandidates,
    create,
    confirm,
    cancel,
  };
};
