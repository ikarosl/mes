import { ref } from 'vue';
import type { ProductionTrackingVisit } from '@company/contracts';
import { productionTrackingApi } from '../../../api/production/tracking';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';

export function useWorkbenchReports(batchId: () => string | null) {
  const items = ref<ProductionTrackingVisit[]>([]);
  const total = ref<number | null>(null);
  const loading = ref(false);
  const error = ref('');
  const reads = useLatestReadRequest(() => {
    loading.value = false;
  });
  let loadedBatchId: string | null = null;

  async function load(): Promise<void> {
    const id = batchId();
    reads.invalidate();
    if (id !== loadedBatchId) {
      items.value = [];
      total.value = null;
      error.value = '';
      loadedBatchId = id;
    }
    if (!id || !reads.isActive()) return;
    const read = reads.begin(() => batchId() === id);
    loading.value = true;
    error.value = '';
    try {
      const result = await productionTrackingApi.reports(
        { batchId: id, page: 1, pageSize: 5 },
        { signal: read.signal, skipErrorHandling: true },
      );
      if (!read.isCurrent()) return;
      items.value = result.items;
      total.value = result.total;
    } catch (failure) {
      if (read.isCurrent())
        error.value = failure instanceof Error ? failure.message : '最近报工加载失败，请重试';
    } finally {
      if (read.isCurrent()) loading.value = false;
    }
  }

  return { items, total, loading, error, load };
}
