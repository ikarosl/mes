import { onScopeDispose, ref, reactive } from 'vue';
import type {
  FinishedGoodsInboundOrderDetail,
  FinishedGoodsInboundOrderItem,
  FinishedGoodsInboundQuery,
} from '@company/contracts';
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
  const details = reactive<Record<string, FinishedGoodsInboundOrderDetail>>({});
  const detailLoading = reactive<Record<string, boolean>>({});
  const detailErrors = reactive<Record<string, string>>({});
  const detailVersions = new Map<string, number>();
  let nextDetailVersion = 0;
  let disposed = false;

  async function load(): Promise<boolean> {
    const current = request.begin();
    loading.value = true;
    error.value = '';
    try {
      const result = await productionApi.listFinishedGoodsInbounds({
        ...query,
        keyword: query.keyword?.trim() || undefined,
      });
      if (!current()) return false;
      rows.value = result.items;
      total.value = result.total;
      return true;
    } catch (failure) {
      if (current()) {
        error.value = '成品入库单加载失败，请重试';
        EMessage.error(failure);
      }
      return false;
    } finally {
      if (current()) loading.value = false;
    }
  }
  async function loadDetail(id: string, force = false): Promise<void> {
    if (detailLoading[id] || (!force && details[id])) return;
    const version = ++nextDetailVersion;
    detailVersions.set(id, version);
    detailLoading[id] = true;
    detailErrors[id] = '';
    try {
      const result = await productionApi.getFinishedGoodsInbound(id);
      if (disposed || detailVersions.get(id) !== version) return;
      details[id] = result;
    } catch {
      if (disposed || detailVersions.get(id) !== version) return;
      detailErrors[id] = details[id]
        ? '历史批准与检验依据刷新失败，当前展示上次读取结果，请重试'
        : '历史批准与检验依据读取失败，请重试';
    } finally {
      if (!disposed && detailVersions.get(id) === version) detailLoading[id] = false;
    }
  }
  function cancelList(): void {
    request.invalidate();
    loading.value = false;
  }
  function cancelDetails(): void {
    for (const id of detailVersions.keys()) {
      detailVersions.delete(id);
      detailLoading[id] = false;
    }
  }
  function retainDetails(ids: Iterable<string>): void {
    const retained = new Set(ids);
    for (const id of Object.keys(details)) {
      if (!retained.has(id)) delete details[id];
    }
    for (const id of detailVersions.keys()) {
      if (retained.has(id)) continue;
      detailVersions.delete(id);
      delete detailLoading[id];
      delete detailErrors[id];
    }
    for (const id of Object.keys(detailLoading)) {
      if (!retained.has(id)) delete detailLoading[id];
    }
    for (const id of Object.keys(detailErrors)) {
      if (!retained.has(id)) delete detailErrors[id];
    }
  }
  onScopeDispose(() => {
    disposed = true;
    cancelDetails();
  });
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
  return {
    query,
    rows,
    total,
    loading,
    error,
    details,
    detailLoading,
    detailErrors,
    load,
    loadDetail,
    cancelList,
    cancelDetails,
    retainDetails,
    search,
    reset,
    changePage,
    changePageSize,
  };
}
