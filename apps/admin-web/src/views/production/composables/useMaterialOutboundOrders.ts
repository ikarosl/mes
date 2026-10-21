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
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';

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
  let createRequest: {
    batchId: string;
    payload: ReturnType<typeof normalizeMaterialOutboundPayload>;
  } | null = null;
  const confirmIntents = new Map<string, ReturnType<typeof useIdempotentIntent>>();
  const listRead = useLatestReadRequest(() => (loading.value = false));
  const detailRead = useLatestReadRequest(() => (detailLoading.value = false));
  const optionRead = useLatestReadRequest(() => (optionLoading.value = false));
  const candidateRead = useLatestReadRequest(() => (candidateLoading.value = false));

  const load = async (query: MaterialOutboundQuery): Promise<void> => {
    if (!listRead.isActive()) return;
    const current = listRead.begin();
    loading.value = true;
    try {
      const result = await productionApi.listMaterialOutboundOrders(query, current.signal);
      if (current.isCurrent()) {
        rows.value = result.items;
        total.value = result.total;
      }
    } catch (error) {
      if (current.isCurrent()) throw error;
    } finally {
      if (current.isCurrent()) loading.value = false;
    }
  };

  const loadDetail = async (outboundId: string): Promise<MaterialOutboundItem | null> => {
    if (!detailRead.isActive()) return null;
    const current = detailRead.begin();
    if (detail.value?.outboundId !== outboundId) detail.value = null;
    detailLoading.value = true;
    try {
      const result = await productionApi.getMaterialOutbound(outboundId, current.signal);
      if (!current.isCurrent()) return null;
      detail.value = result;
      return result;
    } catch (error) {
      if (current.isCurrent()) throw error;
      return null;
    } finally {
      if (current.isCurrent()) detailLoading.value = false;
    }
  };

  const loadBatchOptions = async (): Promise<void> => {
    if (!optionRead.isActive()) return;
    const current = optionRead.begin();
    optionLoading.value = true;
    try {
      const result = await productionApi.listMaterialOutboundBatchOptions(current.signal);
      if (current.isCurrent()) batchOptions.value = result;
    } catch (error) {
      if (current.isCurrent()) throw error;
    } finally {
      if (current.isCurrent()) optionLoading.value = false;
    }
  };

  const loadCandidates = async (batchId: string): Promise<void> => {
    if (!candidateRead.isActive()) return;
    const current = candidateRead.begin();
    candidateLoading.value = true;
    candidates.value = [];
    try {
      const result = await productionApi.listMaterialOutboundCandidates(batchId, current.signal);
      if (current.isCurrent()) candidates.value = result;
    } catch (error) {
      if (current.isCurrent()) throw error;
    } finally {
      if (current.isCurrent()) candidateLoading.value = false;
    }
  };

  const create = async (
    batchId: string,
    payload: CreateMaterialOutboundPayload,
  ): Promise<MaterialOutboundItem> => {
    createRequest ??= { batchId, payload: normalizeMaterialOutboundPayload(payload) };
    const command = createRequest;
    if (command.batchId !== batchId) throw new Error('请先核对原任务的制单结果，再切换任务');
    try {
      const result = await createIntent.execute(
        {
          intentType: 'production.material-outbound.create',
          params: { batchId: command.batchId },
          query: {},
          body: command.payload,
        },
        (key) => productionApi.createMaterialOutbound(command.batchId, command.payload, key),
      );
      createRequest = null;
      return result.outbound;
    } catch (error) {
      if (createIntent.getStatus() === 'idle') createRequest = null;
      throw error;
    }
  };
  const resetCreateIntent = (): void => {
    createIntent.reset();
    createRequest = null;
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
    resetCreateIntent,
    hasUnconfirmedConfirm: () =>
      [...confirmIntents.values()].some((intent) => intent.getStatus() !== 'idle'),
    resetConfirmIntents: () => confirmIntents.clear(),
    cancelDetailRead: detailRead.invalidate,
    load,
    loadDetail,
    loadBatchOptions,
    loadCandidates,
    create,
    confirm,
    cancel,
  };
};
