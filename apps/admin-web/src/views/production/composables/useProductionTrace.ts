import { EMessage } from '../../../utils/message';
import { ref, watch } from 'vue';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import type { ProductionTraceDetail, ProductionTraceWorkOrderGroup } from '@company/contracts';
import { productionApi } from '../../../api/production';

export const useProductionTrace = () => {
  const items = ref<ProductionTraceWorkOrderGroup[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const detailLoading = ref(false);
  const selectedBatchId = ref<string | null>(null);
  const detail = ref<ProductionTraceDetail | null>(null);

  const listRequests = useLatestReadRequest(() => (loading.value = false));
  const detailRequests = useLatestReadRequest(() => (detailLoading.value = false));
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
    if (!listRequests.isActive()) return;
    const { isCurrent, signal } = listRequests.begin();
    loading.value = true;
    try {
      const result = await productionApi.searchProductionTrace(
        {
          keyword: keyword.trim() || undefined,
          page,
          pageSize: 20,
        },
        { skipErrorHandling: true, signal },
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
    if (!detailRequests.isActive()) return;
    selectedBatchId.value = batchId;
    const { isCurrent, signal } = detailRequests.begin(() => selectedBatchId.value === batchId);
    // 切换目标由上方 watch 清空；同一批次刷新保留表格实例，避免整片重建。
    detailLoading.value = true;
    try {
      const result = await productionApi.getProductionTrace(batchId, {
        skipErrorHandling: true,
        signal,
      });
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
