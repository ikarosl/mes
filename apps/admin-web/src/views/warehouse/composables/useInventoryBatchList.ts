import { reactive, ref, watch } from 'vue';
import type { Ref } from 'vue';
import type { InventoryBatchItem, InventoryBatchQuery } from '@company/contracts';
import { productionInventoryApi } from '../../../api/production/inventory';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { EMessage } from '../../../utils/message';

interface InventoryBatchList {
  query: Omit<InventoryBatchQuery, 'itemKind'>;
  items: Ref<InventoryBatchItem[]>;
  total: Ref<number>;
  loading: Ref<boolean>;
  error: Ref<boolean>;
  load(): Promise<void>;
  search(): Promise<void>;
  reset(): Promise<void>;
  changePageSize(value: number): Promise<void>;
  changePage(value: number): Promise<void>;
}

/** 两种库存身份分别持有筛选、分页及结果；切离页签立即使在途读取失效。 */
export function useInventoryBatchList(
  itemKind: InventoryBatchItem['itemKind'],
  isSelected: () => boolean,
): InventoryBatchList {
  const query = reactive<Omit<InventoryBatchQuery, 'itemKind'>>({ page: 1, pageSize: 10 });
  const items = ref<InventoryBatchItem[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const error = ref(false);
  const reads = useLatestReadRequest(() => {
    loading.value = false;
  });

  watch(
    isSelected,
    (selected) => {
      if (!selected) reads.invalidate();
    },
    { flush: 'sync' },
  );

  const load = async (): Promise<void> => {
    if (!isSelected() || !reads.isActive()) return;
    const request = reads.begin(isSelected);
    loading.value = true;
    error.value = false;
    try {
      const result = await productionInventoryApi.listInventoryBatches(
        {
          ...query,
          itemKind,
          keyword: query.keyword?.trim() || undefined,
          batchCode: query.batchCode?.trim() || undefined,
        },
        request.signal,
      );
      if (!request.isCurrent()) return;
      items.value = result.items;
      total.value = result.total;
    } catch (cause) {
      if (!request.isCurrent()) return;
      error.value = true;
      EMessage.error(cause, '库存批次加载失败');
    } finally {
      if (request.isCurrent()) loading.value = false;
    }
  };

  const search = async (): Promise<void> => {
    query.page = 1;
    await load();
  };
  const reset = async (): Promise<void> => {
    query.sourceType = undefined;
    query.keyword = undefined;
    query.batchCode = undefined;
    query.batchStatus = undefined;
    query.page = 1;
    await load();
  };
  const changePageSize = async (value: number): Promise<void> => {
    query.pageSize = value;
    query.page = 1;
    await load();
  };
  const changePage = async (value: number): Promise<void> => {
    query.page = value;
    await load();
  };

  return { query, items, total, loading, error, load, search, reset, changePageSize, changePage };
}
