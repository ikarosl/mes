import { EMessage } from '../../../utils/message';
import { ref, watch } from 'vue';
import { useLatestRequest } from '../../../composables/requests/useLatestRequest';
import type { ProductionTraceDetail, ProductionTraceWorkOrderGroup } from '@company/contracts';
import { productionApi } from '../../../api/production';

export const useProductionTrace = () => {
  const items = ref<ProductionTraceWorkOrderGroup[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const detailLoading = ref(false);
  const selectedBatchId = ref<string | null>(null);
  const detail = ref<ProductionTraceDetail | null>(null);

  const listRequests = useLatestRequest();
  const detailRequests = useLatestRequest();
  watch(
    selectedBatchId,
    () => {
      detailRequests.invalidate();
      detailLoading.value = false;
      detail.value = null;
    },
    { flush: 'sync' },
  );

  const search = async (keyword = '', page = 1): Promise<void> => {
    const isCurrent = listRequests.begin();
    loading.value = true;
    try {
      const result = await productionApi.searchProductionTrace(
        {
          keyword: keyword.trim() || undefined,
          page,
          pageSize: 20,
        },
        { skipErrorHandling: true },
      );
      if (!isCurrent()) return;
      items.value = result.items;
      total.value = result.total;
      if (
        !result.items.some((item) =>
          item.batches.some((batch) => batch.productionBatchId === selectedBatchId.value),
        )
      ) {
        selectedBatchId.value = null;
        detail.value = null;
        const firstBatch = result.items[0]?.batches[0];
        if (firstBatch) await selectBatch(firstBatch.productionBatchId);
      }
    } catch (error) {
      if (isCurrent()) EMessage.error(error, '加载失败，请重试');
    } finally {
      if (isCurrent()) loading.value = false;
    }
  };

  const selectBatch = async (batchId: string): Promise<void> => {
    selectedBatchId.value = batchId;
    const isCurrent = detailRequests.begin(() => selectedBatchId.value === batchId);
    detail.value = null;
    detailLoading.value = true;
    try {
      const result = await productionApi.getProductionTrace(batchId, { skipErrorHandling: true });
      if (!isCurrent()) return;
      if (result.summary.productionBatchId !== batchId)
        throw new Error('追溯详情与当前选择不一致，请刷新');
      detail.value = result;
    } catch (error) {
      if (isCurrent()) EMessage.error(error, '加载失败，请重试');
    } finally {
      if (isCurrent()) detailLoading.value = false;
    }
  };

  return { items, total, loading, detailLoading, selectedBatchId, detail, search, selectBatch };
};
