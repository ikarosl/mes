import { ref } from 'vue';
import type { ProductionTraceDetail, ProductionTraceWorkOrderGroup } from '@company/contracts';
import { productionApi } from '../../../api/production';

export const useProductionTrace = () => {
  const items = ref<ProductionTraceWorkOrderGroup[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const detailLoading = ref(false);
  const selectedBatchId = ref<string | null>(null);
  const detail = ref<ProductionTraceDetail | null>(null);

  const search = async (keyword = '', page = 1): Promise<void> => {
    loading.value = true;
    try {
      const result = await productionApi.searchProductionTrace({
        keyword: keyword.trim() || undefined,
        page,
        pageSize: 20,
      });
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
    } finally {
      loading.value = false;
    }
  };

  const selectBatch = async (batchId: string): Promise<void> => {
    selectedBatchId.value = batchId;
    detailLoading.value = true;
    try {
      detail.value = await productionApi.getProductionTrace(batchId);
    } finally {
      detailLoading.value = false;
    }
  };

  return { items, total, loading, detailLoading, selectedBatchId, detail, search, selectBatch };
};
