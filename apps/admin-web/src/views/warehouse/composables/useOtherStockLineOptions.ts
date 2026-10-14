import { computed, ref, watch } from 'vue';
import type {
  OtherInventoryDirection,
  OtherStockCandidate,
  OtherStockObject,
} from '@company/contracts';
import { otherInventoryApi } from '../../../api/other-inventory';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { EMessage } from '../../../utils/message';
import type { OtherInventoryDraftLine } from '../other-inventory-draft';
import { otherStockObjectLabel } from '../other-inventory-presentation';

export function useOtherStockLineOptions(
  getLine: () => OtherInventoryDraftLine,
  direction: OtherInventoryDirection,
  verifyObject: (value: OtherStockObject | null) => void,
) {
  const objects = ref<OtherStockObject[]>([]);
  const objectLoading = ref(false);
  const objectError = ref(false);
  const objectUnavailable = ref(false);
  const objectHasMore = ref(false);
  const objectKeyword = ref('');
  const batches = ref<OtherStockCandidate[]>([]);
  const batchLoading = ref(false);
  const batchError = ref(false);
  const batchHasMore = ref(false);
  const batchKeyword = ref('');
  const objectReader = useLatestReadRequest(() => (objectLoading.value = false));
  const batchReader = useLatestReadRequest(() => (batchLoading.value = false));
  const objectOptions = computed(() =>
    objects.value.map((object) => ({ value: object.id, label: otherStockObjectLabel(object) })),
  );
  const batchOptions = computed(() =>
    batches.value.map((batch) => ({
      value: batch.batchId,
      label: `${batch.batchCode} · ${batch.itemCode} · ${batch.itemName}${batch.materialVariantCode ? ` · 版本 ${batch.materialVariantCode}` : ''} · ${direction === 'outbound' ? '可出' : '可用库存'} ${direction === 'outbound' ? batch.usableQuantity : batch.availableQuantity} ${batch.unit}`,
    })),
  );

  async function refreshObjects(): Promise<void> {
    const line = getLine();
    if (line.target.mode !== 'new' || !objectReader.isActive()) return;
    const { key, itemKind } = line;
    const selectedId = line.object?.id;
    const request = objectReader.begin(
      () =>
        getLine().key === key &&
        getLine().itemKind === itemKind &&
        getLine().target.mode === 'new' &&
        getLine().object?.id === selectedId,
    );
    objectLoading.value = true;
    objectError.value = false;
    objectUnavailable.value = false;
    try {
      const result = await otherInventoryApi.stockObjects(
        {
          itemKind,
          keyword: objectKeyword.value.trim() || undefined,
          includeIds: selectedId ? [selectedId] : undefined,
        },
        request.signal,
      );
      if (!request.isCurrent()) return;
      objects.value = result.items;
      objectHasMore.value = result.hasMore;
      if (selectedId) {
        const selected = result.items.find((object) => object.id === selectedId) ?? null;
        objectUnavailable.value = !selected;
        verifyObject(selected);
      }
    } catch (cause) {
      if (!request.isCurrent()) return;
      objectError.value = true;
      if (selectedId) verifyObject(null);
      EMessage.error(cause, '库存对象候选加载失败');
    } finally {
      if (request.isCurrent()) objectLoading.value = false;
    }
  }
  async function refreshBatches(): Promise<void> {
    const line = getLine();
    if (line.target.mode !== 'existing' || !batchReader.isActive()) return;
    const { key, itemKind } = line;
    const request = batchReader.begin(
      () =>
        getLine().key === key &&
        getLine().itemKind === itemKind &&
        getLine().target.mode === 'existing',
    );
    batchLoading.value = true;
    batchError.value = false;
    try {
      const result = await otherInventoryApi.stockCandidates(
        {
          direction,
          itemKind,
          keyword: batchKeyword.value.trim() || undefined,
          page: 1,
          pageSize: 50,
        },
        request.signal,
      );
      if (!request.isCurrent()) return;
      batches.value = result.items;
      batchHasMore.value = result.total > result.items.length;
    } catch (cause) {
      if (!request.isCurrent()) return;
      batchError.value = true;
      EMessage.error(cause, '库存批次候选加载失败');
    } finally {
      if (request.isCurrent()) batchLoading.value = false;
    }
  }
  function searchObjects(keyword: string): void {
    objectKeyword.value = keyword;
    void refreshObjects();
  }
  function searchBatches(keyword: string): void {
    batchKeyword.value = keyword;
    void refreshBatches();
  }
  watch(
    () => [getLine().key, getLine().itemKind, getLine().target.mode, getLine().object?.id] as const,
    () => {
      objectReader.invalidate();
      batchReader.invalidate();
      objects.value = [];
      batches.value = [];
      objectError.value = false;
      objectUnavailable.value = false;
      batchError.value = false;
      objectHasMore.value = false;
      batchHasMore.value = false;
      objectKeyword.value = '';
      batchKeyword.value = '';
      const line = getLine();
      if (line.target.mode === 'new' && line.object?.id) void refreshObjects();
    },
    { immediate: true },
  );

  return {
    objects,
    objectOptions,
    objectLoading,
    objectError,
    objectUnavailable,
    objectHasMore,
    batches,
    batchOptions,
    batchLoading,
    batchError,
    batchHasMore,
    refreshObjects,
    refreshBatches,
    searchObjects,
    searchBatches,
  };
}
