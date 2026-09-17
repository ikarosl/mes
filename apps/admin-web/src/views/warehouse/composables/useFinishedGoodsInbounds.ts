import { ref, reactive } from 'vue';
import type { FinishedGoodsInboundOrderItem, FinishedGoodsInboundQuery } from '@company/contracts';
import { productionApi } from '../../../api/production';
import { useLatestRequest } from '../../../composables/requests/useLatestRequest';
import { EMessage } from '../../../utils/message';
export function useFinishedGoodsInbounds() {
  const query = reactive<FinishedGoodsInboundQuery>({ page: 1, pageSize: 20 });
  const rows = ref<FinishedGoodsInboundOrderItem[]>([]),
    total = ref(0),
    loading = ref(false),
    error = ref('');
  const request = useLatestRequest();
  async function load() {
    const current = request.begin();
    loading.value = true;
    error.value = '';
    try {
      const result = await productionApi.listFinishedGoodsInbounds({
        ...query,
        keyword: query.keyword?.trim() || undefined,
      });
      if (current()) {
        rows.value = result.items;
        total.value = result.total;
      }
    } catch (failure) {
      if (current()) {
        error.value = '成品入库单加载失败，请重试';
        EMessage.error(failure);
      }
    } finally {
      if (current()) loading.value = false;
    }
  }
  function search() {
    query.page = 1;
    return load();
  }
  function reset() {
    query.keyword = undefined;
    query.status = undefined;
    query.sourceType = undefined;
    return search();
  }
  function changePage(page: number) {
    query.page = page;
    return load();
  }
  function changePageSize(size: number) {
    query.pageSize = size;
    return search();
  }
  return { query, rows, total, loading, error, load, search, reset, changePage, changePageSize };
}
