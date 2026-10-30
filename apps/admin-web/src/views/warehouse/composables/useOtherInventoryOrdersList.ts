import { reactive, ref } from 'vue';
import type {
  OtherInventoryDirection,
  OtherInventoryOrder,
  OtherInventoryOrderQuery,
} from '@company/contracts';
import { otherInventoryApi } from '../../../api/other-inventory';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { EMessage } from '../../../utils/message';
import { useInboundHistoryExpansion } from './use-inbound-history-expansion';

export function useOtherInventoryOrdersList(direction: OtherInventoryDirection) {
  const query = reactive<OtherInventoryOrderQuery>({ page: 1, pageSize: 10 });
  const rows = ref<OtherInventoryOrder[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const error = ref(false);
  const historyExpansion = useInboundHistoryExpansion();
  const reader = useLatestReadRequest(() => (loading.value = false));

  async function load(): Promise<void> {
    if (!reader.isActive()) return;
    const request = reader.begin();
    loading.value = true;
    error.value = false;
    try {
      const result = await otherInventoryApi.list(
        direction,
        { ...query, keyword: query.keyword?.trim() || undefined },
        request.signal,
      );
      if (!request.isCurrent()) return;
      rows.value = result.items;
      total.value = result.total;
      historyExpansion.sync(result.items.map((row) => row.id));
    } catch (cause) {
      if (!request.isCurrent()) return;
      error.value = true;
      EMessage.error(cause, '其他出入库单列表加载失败');
    } finally {
      if (request.isCurrent()) loading.value = false;
    }
  }
  function search(): Promise<void> {
    query.page = 1;
    historyExpansion.initializeNextLoad();
    return load();
  }
  function reset(): Promise<void> {
    query.keyword = undefined;
    query.status = undefined;
    return search();
  }
  function changePage(page: number): Promise<void> {
    query.page = page;
    historyExpansion.initializeNextLoad();
    return load();
  }
  function changePageSize(size: number): Promise<void> {
    query.pageSize = size;
    return search();
  }
  return {
    query,
    rows,
    total,
    loading,
    error,
    historyExpansion,
    load,
    search,
    reset,
    changePage,
    changePageSize,
  };
}
