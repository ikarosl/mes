import { computed, ref } from 'vue';
import type { ReceiptAllocationCandidate } from '@company/contracts';
import { procurementApi } from '../../../api/procurement';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';

/** 搜索窗口与已选归属分别核验，搜索未命中不代表已选项失效。 */
export function useReceiptAllocationOptions(
  getReceiptLineId: () => string | undefined,
  getSelectedIds: () => string[],
  canInteract: () => boolean,
) {
  const items = ref<ReceiptAllocationCandidate[]>([]);
  const labels = ref(new Map<string, string>());
  const eligibleIds = ref<string[]>([]);
  const keyword = ref('');
  const hasMore = ref(false);
  const loading = ref(false);
  const error = ref(false);
  const verified = ref(false);
  const read = useLatestReadRequest(() => {
    loading.value = false;
    verified.value = false;
  });
  const invalidSelectedIds = computed(() =>
    verified.value ? getSelectedIds().filter((id) => !eligibleIds.value.includes(id)) : [],
  );
  const selectionReady = computed(
    () => verified.value && !loading.value && !error.value && !invalidSelectedIds.value.length,
  );
  const load = async () => {
    const id = getReceiptLineId();
    if (!id || !read.isActive()) return null;
    const request = read.begin(() => getReceiptLineId() === id);
    loading.value = true;
    error.value = false;
    try {
      const result = await procurementApi.receiptAllocationCandidates(
        id,
        {
          keyword: keyword.value.trim() || undefined,
          includeIds: [...new Set(getSelectedIds())],
        },
        request.signal,
      );
      if (!request.isCurrent()) return null;
      const selectedIds = new Set(getSelectedIds());
      const current = [...result.items, ...result.resolved];
      // 保留已选标签供失败/失效时辨认；是否可提交仅由本次资格核验决定。
      labels.value = new Map([
        ...[...labels.value].filter(([id]) => selectedIds.has(id)),
        ...current.map((row): [string, string] => [row.purchaseOrderLineId, candidateLabel(row)]),
      ]);
      items.value = result.items;
      eligibleIds.value = current.map((row) => row.purchaseOrderLineId);
      hasMore.value = result.hasMore;
      verified.value = true;
      return result;
    } catch {
      if (request.isCurrent()) error.value = true;
      return null;
    } finally {
      if (request.isCurrent()) loading.value = false;
    }
  };
  const search = (value: string) => {
    if (!canInteract()) return Promise.resolve(null);
    keyword.value = value;
    return load();
  };
  const refresh = () => (canInteract() ? load() : Promise.resolve(null));
  const optionsFor = (selectedId: string | null) => {
    const ids = items.value.map((row) => row.purchaseOrderLineId);
    if (selectedId && labels.value.has(selectedId) && !ids.includes(selectedId))
      ids.unshift(selectedId);
    return ids.map((id) => ({
      value: id,
      label: labels.value.get(id)!,
      disabled: !verified.value || !eligibleIds.value.includes(id),
    }));
  };
  // 详情只提供初始显示名称，不授予候选资格。
  const seedLabels = (sources: Array<{ purchaseOrderLineId: string; purchaseNo: string }>) => {
    labels.value = new Map(sources.map((row) => [row.purchaseOrderLineId, row.purchaseNo]));
  };
  const reset = () => {
    read.invalidate();
    items.value = [];
    labels.value = new Map();
    eligibleIds.value = [];
    keyword.value = '';
    hasMore.value = false;
    error.value = false;
  };
  return {
    hasMore,
    loading,
    error,
    invalidSelectedIds,
    selectionReady,
    load,
    search,
    refresh,
    optionsFor,
    seedLabels,
    reset,
    invalidate: read.invalidate,
  };
}

function candidateLabel(candidate: ReceiptAllocationCandidate): string {
  return `${candidate.purchaseNo} · ${candidate.isOriginal ? '原采购行' : '已到货补单'} · 计划 ${candidate.plannedQuantity}${candidate.remainingBindingQuantity === null ? '' : ` · 待首次承接 ${candidate.remainingBindingQuantity}`}`;
}
