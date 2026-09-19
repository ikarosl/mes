import { reactive, ref } from 'vue';
import type {
  PurchaseOrderItem,
  PurchaseOrderSourceType,
  PurchaseOrderStatus,
} from '@company/contracts';
import { procurementApi } from '../../../api/procurement';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { usePageActivationRefresh } from '../../../composables/requests/usePageActivationRefresh';
import { EMessage } from '../../../utils/message';

export function usePurchaseOrdersList() {
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
  const load = async (): Promise<void> => {
    if (!request.isActive()) return;
    const current = request.begin();
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
    } catch (error) {
      if (current.isCurrent()) EMessage.error(error, '采购列表加载失败');
    } finally {
      if (current.isCurrent()) loading.value = false;
    }
  };
  const search = async (): Promise<void> => {
    page.value = 1;
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
    await load();
  };
  const changePageSize = async (value: number): Promise<void> => {
    pageSize.value = value;
    await search();
  };
  usePageActivationRefresh(load);
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
