import { onActivated, ref, watch } from 'vue';
import { procurementApi } from '../../../api/procurement';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { EMessage } from '../../../utils/message';

/** 由需求总览整体批量读取，避免每行请求及将采购数量解释为需求履约量。 */
export function useRelatedPurchaseCounts(visible: () => boolean, demandIds: () => string[]) {
  const counts = ref(new Map<string, number>()),
    loading = ref(false);
  const read = useLatestReadRequest(() => {
    loading.value = false;
  });
  const load = async (): Promise<void> => {
    if (!visible() || !read.isActive()) return;
    const ids = demandIds();
    const current = read.begin(visible);
    counts.value = new Map();
    if (!ids.length) return;
    loading.value = true;
    try {
      const chunks: string[][] = [];
      for (let offset = 0; offset < ids.length; offset += 100)
        chunks.push(ids.slice(offset, offset + 100));
      const results = await Promise.all(
        chunks.map((part) =>
          procurementApi.relatedPurchases(
            { demandIds: part, page: 1, pageSize: 1 },
            current.signal,
          ),
        ),
      );
      if (current.isCurrent())
        counts.value = new Map(
          results.flatMap((result) =>
            result.summaries.map((entry) => [entry.demandId, entry.purchaseOrderCount] as const),
          ),
        );
    } catch (error) {
      if (current.isCurrent())
        EMessage.error(error, '相关采购数量加载失败，可点击相关采购重新查看');
    } finally {
      if (current.isCurrent()) loading.value = false;
    }
  };
  watch(
    () => [visible(), demandIds().join(',')],
    () => {
      if (visible()) void load();
      else read.invalidate();
    },
    { immediate: true },
  );
  onActivated(() => {
    if (visible()) void load();
  });
  return { counts, loading, load };
}
