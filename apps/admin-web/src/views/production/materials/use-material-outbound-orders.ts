import { ref } from 'vue';
import type {
  CreateMaterialOutboundPayload,
  MaterialOutboundBatchOption,
  MaterialOutboundCandidateItem,
  MaterialOutboundItem,
  MaterialOutboundQuery,
} from '@company/contracts';
import { normalizeMaterialOutboundPayload } from '@company/utils';
import { productionMaterialOutboundsApi } from '../../../api/production/material-outbounds';
import {
  useIdempotentIntent,
  type IdempotentIntentStatus,
} from '../../../composables/idempotency/useIdempotentIntent';
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
  const createIntentStatus = ref<IdempotentIntentStatus>('idle');
  let createInFlight = false;
  let createRequest: {
    batchId: string;
    payload: ReturnType<typeof normalizeMaterialOutboundPayload>;
  } | null = null;
  const confirmIntent = useIdempotentIntent('整单出库确认');
  const confirmIntentStatus = ref<IdempotentIntentStatus>('idle');
  const confirmSubmitting = ref(false),
    confirmingId = ref(''),
    confirmingNo = ref('');
  let confirmRequest: { outboundId: string; version: number } | null = null;
  const listRead = useLatestReadRequest(() => (loading.value = false));
  const detailRead = useLatestReadRequest(() => (detailLoading.value = false));
  const optionRead = useLatestReadRequest(() => (optionLoading.value = false));
  const candidateRead = useLatestReadRequest(() => (candidateLoading.value = false));

  const load = async (query: MaterialOutboundQuery): Promise<void> => {
    if (!listRead.isActive()) return;
    const current = listRead.begin();
    loading.value = true;
    try {
      const result = await productionMaterialOutboundsApi.listMaterialOutboundOrders(
        query,
        current.signal,
      );
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
      const result = await productionMaterialOutboundsApi.getMaterialOutbound(
        outboundId,
        current.signal,
      );
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
      const result = await productionMaterialOutboundsApi.listMaterialOutboundBatchOptions(
        current.signal,
      );
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
      const result = await productionMaterialOutboundsApi.listMaterialOutboundCandidates(
        batchId,
        current.signal,
      );
      if (current.isCurrent()) candidates.value = result;
    } catch (error) {
      if (current.isCurrent()) throw error;
    } finally {
      if (current.isCurrent()) candidateLoading.value = false;
    }
  };

  const create = async (
    batchId?: string,
    payload?: CreateMaterialOutboundPayload,
  ): Promise<MaterialOutboundItem> => {
    if (createInFlight) throw new Error('当前出库单正在创建，请稍候');
    if (!createRequest && batchId && payload)
      createRequest = { batchId, payload: normalizeMaterialOutboundPayload(payload) };
    const command = createRequest;
    if (!command) throw new Error('原出库单提交内容缺失，请先核对出库单列表');
    if (batchId && command.batchId !== batchId)
      throw new Error('请先核对原任务的制单结果，再切换任务');
    createInFlight = true;
    try {
      const result = await createIntent.execute(
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
      createRequest = null;
      return result.outbound;
    } catch (error) {
      if (createIntent.getStatus() === 'idle') createRequest = null;
      throw error;
    } finally {
      createIntentStatus.value = createIntent.getStatus();
      createInFlight = false;
    }
  };
  const resetCreateIntent = (): void => {
    if (createInFlight) return;
    createIntent.reset();
    createIntentStatus.value = 'idle';
    createRequest = null;
  };

  const confirm = async (row?: MaterialOutboundItem): Promise<MaterialOutboundItem | null> => {
    if (confirmSubmitting.value) return null;
    if (!confirmRequest && row) {
      confirmRequest = { outboundId: row.outboundId, version: row.version };
      confirmingId.value = row.outboundId;
      confirmingNo.value = row.outboundNo;
    }
    const command = confirmRequest;
    if (!command) throw new Error('原出库确认内容缺失，请先核对出库单记录');
    if (row && command.outboundId !== row.outboundId)
      throw new Error('请先处理上次出库确认，再确认其他单据');
    const pendingKey = `confirm:${command.outboundId}`;
    pendingKeys.value = new Set(pendingKeys.value).add(pendingKey);
    confirmSubmitting.value = true;
    try {
      const result = await confirmIntent.execute(
        {
          intentType: 'production.material-outbound.confirm',
          params: { outboundId: command.outboundId },
          query: {},
          body: { version: command.version },
        },
        (key) =>
          productionMaterialOutboundsApi.confirmMaterialOutbound(
            command.outboundId,
            command.version,
            key,
          ),
      );
      return result.outbound;
    } finally {
      confirmIntentStatus.value = confirmIntent.getStatus();
      if (confirmIntentStatus.value === 'idle') {
        confirmRequest = null;
        confirmingId.value = '';
        confirmingNo.value = '';
      }
      confirmSubmitting.value = false;
      removePending(pendingKey);
    }
  };
  const resetConfirmIntent = (): void => {
    if (confirmSubmitting.value) return;
    confirmIntent.reset();
    confirmIntentStatus.value = 'idle';
    confirmRequest = null;
    confirmingId.value = '';
    confirmingNo.value = '';
  };

  const cancel = async (
    row: MaterialOutboundItem,
    reason: string,
  ): Promise<MaterialOutboundItem> => {
    const pendingKey = `cancel:${row.outboundId}`;
    if (pendingKeys.value.has(pendingKey)) return row;
    pendingKeys.value = new Set(pendingKeys.value).add(pendingKey);
    try {
      return await productionMaterialOutboundsApi.cancelMaterialOutbound(row.outboundId, {
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
    createIntentStatus,
    resetCreateIntent,
    confirmIntentStatus,
    confirmSubmitting,
    confirmingId,
    confirmingNo,
    resetConfirmIntent,
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
