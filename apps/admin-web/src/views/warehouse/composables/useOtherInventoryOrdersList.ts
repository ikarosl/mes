import { reactive, ref } from 'vue';
import type {
  OtherInventoryDirection,
  OtherInventoryOrder,
  OtherInventoryOrderQuery,
} from '@company/contracts';
import { otherInventoryApi } from '../../../api/other-inventory';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { EMessage } from '../../../utils/message';

export function useOtherInventoryOrdersList(direction: OtherInventoryDirection) {
  const query = reactive<OtherInventoryOrderQuery>({ page: 1, pageSize: 20 });
  const rows = ref<OtherInventoryOrder[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const error = ref(false);
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
    return load();
  }
  function reset(): Promise<void> {
    query.keyword = undefined;
    query.status = undefined;
    return search();
  }
  function changePage(page: number): Promise<void> {
    query.page = page;
    return load();
  }
  function changePageSize(size: number): Promise<void> {
    query.pageSize = size;
    return search();
  }
  return { query, rows, total, loading, error, load, search, reset, changePage, changePageSize };
}
