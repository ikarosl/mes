import { computed, ref } from 'vue';
import type { ProductionBatchItem } from '@company/contracts';
import { productionTasksApi } from '../../../api/production/tasks';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { EMessage } from '../../../utils/message';

export function useTrackingTaskSearch(selected: () => ProductionBatchItem | null) {
  const tasks = ref<ProductionBatchItem[]>([]),
    loading = ref(false),
    error = ref(false),
    hasMore = ref(false);
  const reads = useLatestReadRequest(() => {
    loading.value = false;
  });
  let keyword = '';
  async function search(value = keyword): Promise<void> {
    if (!reads.isActive()) return;
    keyword = value;
    const read = reads.begin();
    loading.value = true;
    error.value = false;
    try {
      const result = await productionTasksApi.listBatches(
        { keyword: keyword.trim() || undefined, page: 1, pageSize: 20 },
        { signal: read.signal, skipErrorHandling: true },
      );
      if (!read.isCurrent()) return;
      tasks.value = result.items;
      hasMore.value = result.total > result.items.length;
    } catch (failure) {
      if (read.isCurrent()) {
        error.value = true;
        EMessage.error(failure, '任务候选加载失败');
      }
    } finally {
      if (read.isCurrent()) loading.value = false;
    }
  }
  const options = computed(() => {
    const current = selected();
    const values = [...tasks.value];
    if (current && !values.some((item) => item.id === current.id)) values.unshift(current);
    return values.map((item) => ({
      value: item.id,
      label: `${item.batchNo} / ${item.productName}`,
    }));
  });
  return { loading, error, hasMore, options, search };
}
