import { reactive, ref } from 'vue';
import type {
  PurchaseOrderItem,
  PurchaseOrderSourceType,
  PurchaseOrderStatus,
} from '@company/contracts';
import { procurementApi } from '../../../api/procurement';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { usePageInitialLoad } from '../../../composables/requests/usePageInitialLoad';
import { EMessage } from '../../../utils/message';

interface PurchaseOrdersLoadedOptions {
  refreshExpanded: boolean;
  expansionMode: 'initial' | 'query' | 'preserve';
}

export function usePurchaseOrdersList(
  onLoaded?: (rows: PurchaseOrderItem[], options: PurchaseOrdersLoadedOptions) => void,
) {
  const query = reactive({
    keyword: '',
    status: '' as PurchaseOrderStatus | '',
    sourceType: '' as PurchaseOrderSourceType | '',
  });
  const rows = ref<PurchaseOrderItem[]>([]);
  const total = ref(0),
    page = ref(1),
    pageSize = ref(10),
    loading = ref(false);
  const request = useLatestReadRequest(() => {
    loading.value = false;
  });
  // 失败或取消不消费初始化意图，手动刷新仍可重试同一查询。
  let pendingExpansionMode: PurchaseOrdersLoadedOptions['expansionMode'] = 'initial';
  const load = async (options?: { refreshExpanded?: boolean }): Promise<void> => {
    if (!request.isActive()) return;
    const current = request.begin();
    const expansionMode = pendingExpansionMode;
    loading.value = true;
    try {
      const result = await procurementApi.listOrders(
        {
          page: page.value,
          pageSize: pageSize.value,
          keyword: query.keyword.trim() || undefined,
          status: query.status || undefined,
          sourceType: query.sourceType || undefined,
        },
        current.signal,
      );
      if (!current.isCurrent()) return;
      rows.value = result.items;
      total.value = result.total;
      pendingExpansionMode = 'preserve';
      onLoaded?.(result.items, {
        refreshExpanded: options?.refreshExpanded !== false,
        expansionMode,
      });
    } catch (error) {
      if (current.isCurrent()) EMessage.error(error, '采购列表加载失败');
    } finally {
      if (current.isCurrent()) loading.value = false;
    }
  };
  const search = async (): Promise<void> => {
    page.value = 1;
    pendingExpansionMode = 'query';
    await load();
  };
  const reset = async (): Promise<void> => {
    query.keyword = '';
    query.status = '';
    query.sourceType = '';
    await search();
  };
  const changePage = async (value: number): Promise<void> => {
    page.value = value;
    pendingExpansionMode = 'query';
    await load();
  };
  const changePageSize = async (value: number): Promise<void> => {
    pageSize.value = value;
    await search();
  };
  usePageInitialLoad(load);
  return {
    query,
    rows,
    total,
    page,
    pageSize,
    loading,
    load,
    search,
    reset,
    changePage,
    changePageSize,
  };
}
