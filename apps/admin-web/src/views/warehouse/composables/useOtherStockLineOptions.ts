import { computed, ref, watch } from 'vue';
import type {
  OtherInventoryDirection,
  OtherStockCandidate,
  OtherStockMaterial,
  OtherStockObject,
} from '@company/contracts';
import { otherInventoryApi } from '../../../api/other-inventory';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { EMessage } from '../../../utils/message';
import type { OtherInventoryDraftLine } from '../other-inventory-draft';
import { otherStockMaterialLabel } from '../other-inventory-presentation';

export function useOtherStockLineOptions(
  getLine: () => OtherInventoryDraftLine,
  direction: OtherInventoryDirection,
  verifyMaterial: (value: OtherStockMaterial | null) => void,
  verifyObject: (value: OtherStockObject | null) => void,
) {
  const materials = ref<OtherStockMaterial[]>([]);
  const materialLoading = ref(false);
  const materialError = ref(false);
  const materialUnavailable = ref(false);
  const materialHasMore = ref(false);
  const materialKeyword = ref('');
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
  const materialReader = useLatestReadRequest(() => (materialLoading.value = false));
  const objectReader = useLatestReadRequest(() => (objectLoading.value = false));
  const batchReader = useLatestReadRequest(() => (batchLoading.value = false));
  const materialOptions = computed(() =>
    materials.value.map((material) => ({
      value: material.id,
      label: otherStockMaterialLabel(material),
    })),
  );
  const objectOptions = computed(() =>
    objects.value.map((object) => ({
      value: object.id,
      label:
        object.itemKind === 'material'
          ? (object.materialVariantCode ?? object.id)
          : `${object.code} · ${object.name}`,
    })),
  );
  const batchOptions = computed(() =>
    batches.value.map((batch) => ({
      value: batch.batchId,
      label: `${batch.batchCode} · ${batch.itemCode} · ${batch.itemName}${batch.materialVariantCode ? ` · 版本 ${batch.materialVariantCode}` : ''} · ${direction === 'outbound' ? '可出' : '可用库存'} ${direction === 'outbound' ? batch.usableQuantity : batch.availableQuantity} ${batch.unit}`,
    })),
  );

  async function refreshMaterials(): Promise<void> {
    const line = getLine();
    if (line.target.mode !== 'new' || line.itemKind !== 'material' || !materialReader.isActive())
      return;
    const { key } = line;
    const selectedId = line.material?.id;
    const request = materialReader.begin(
      () =>
        getLine().key === key &&
        getLine().itemKind === 'material' &&
        getLine().target.mode === 'new' &&
        getLine().material?.id === selectedId,
    );
    materialLoading.value = true;
    materialError.value = false;
    materialUnavailable.value = false;
    if (selectedId) verifyMaterial(null);
    try {
      const result = await otherInventoryApi.stockMaterials(
        {
          keyword: materialKeyword.value.trim() || undefined,
          includeIds: selectedId ? [selectedId] : undefined,
        },
        request.signal,
      );
      if (!request.isCurrent()) return;
      materials.value = result.items;
      materialHasMore.value = result.hasMore;
      if (selectedId) {
        const selected = result.items.find((material) => material.id === selectedId) ?? null;
        materialUnavailable.value = !selected;
        verifyMaterial(selected);
      }
    } catch (cause) {
      if (!request.isCurrent()) return;
      materialError.value = true;
      if (selectedId) verifyMaterial(null);
      EMessage.error(cause, '库存物料候选加载失败');
    } finally {
      if (request.isCurrent()) materialLoading.value = false;
    }
  }

  async function refreshObjects(): Promise<void> {
    const line = getLine();
    if (line.target.mode !== 'new' || !objectReader.isActive()) return;
    const { key, itemKind } = line;
    const materialId = itemKind === 'material' ? line.material?.id : undefined;
    if (itemKind === 'material' && !materialId) return;
    const selectedId = line.object?.id;
    const request = objectReader.begin(
      () =>
        getLine().key === key &&
        getLine().itemKind === itemKind &&
        getLine().target.mode === 'new' &&
        (itemKind !== 'material' || getLine().material?.id === materialId) &&
        getLine().object?.id === selectedId,
    );
    objectLoading.value = true;
    objectError.value = false;
    objectUnavailable.value = false;
    if (selectedId) verifyObject(null);
    try {
      const result = await otherInventoryApi.stockObjects(
        {
          itemKind,
          materialId,
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

  function searchMaterials(keyword: string): void {
    materialKeyword.value = keyword;
    void refreshMaterials();
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
    () =>
      [
        getLine().key,
        getLine().itemKind,
        getLine().target.mode,
        getLine().material?.id,
        getLine().object?.id,
      ] as const,
    (current, previous) => {
      if (previous && current.every((value, index) => value === previous[index])) return;
      const contextChanged =
        !previous || current.slice(0, 4).some((value, index) => value !== previous[index]);
      objectReader.invalidate();
      objectError.value = false;
      objectUnavailable.value = false;
      if (contextChanged) {
        materialReader.invalidate();
        batchReader.invalidate();
        materials.value = [];
        objects.value = [];
        batches.value = [];
        materialError.value = false;
        materialUnavailable.value = false;
        batchError.value = false;
        materialHasMore.value = false;
        objectHasMore.value = false;
        batchHasMore.value = false;
        materialKeyword.value = '';
        objectKeyword.value = '';
        batchKeyword.value = '';
      }
      const line = getLine();
      if (line.target.mode !== 'new') return;
      if (line.itemKind === 'material' && line.material?.id) {
        if (contextChanged) void refreshMaterials();
        void refreshObjects();
      } else if (line.itemKind === 'finished_product' && line.object?.id) {
        void refreshObjects();
      }
    },
    { immediate: true },
  );

  return {
    materials,
    materialOptions,
    materialLoading,
    materialError,
    materialUnavailable,
    materialHasMore,
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
    refreshMaterials,
    refreshObjects,
    refreshBatches,
    searchMaterials,
    searchObjects,
    searchBatches,
  };
}
