import { reactive, ref } from 'vue';
import type { WorkOrderItem, WorkOrderStatus } from '@company/contracts';
import { productionApi } from '../../../api/production';
import { EMessage } from '../../../utils/message';

/** 工单页正式列表：查询、分页与列表加载。写操作成功后只调用 loadOrders()。 */
export function useWorkOrdersList() {
  const orders = ref<WorkOrderItem[]>([]);
  const loading = ref(false);
  /** 列表请求代际：快速查询/翻页时丢弃旧响应（last-request-wins，见 frontend-architecture §7.3） */
  let listRequestToken = 0;
  const total = ref(0);
  const currentPage = ref(1);
  const pageSize = ref(10);
  const query = reactive<{ keyword: string; productId: string; status: string }>({
    keyword: '',
    productId: '',
    status: '',
  });

  const loadOrders = async (): Promise<void> => {
    const token = ++listRequestToken;
    loading.value = true;
    try {
      const page = await productionApi.listOrders({
        page: currentPage.value,
        pageSize: pageSize.value,
        keyword: query.keyword.trim() || undefined,
        productId: query.productId || undefined,
        status: (query.status || undefined) as WorkOrderStatus | undefined,
      });
      if (token !== listRequestToken) return; // 查询/翻页已变化，丢弃旧响应
      orders.value = page.items;
      total.value = page.total;
    } catch (error) {
      if (token !== listRequestToken) return; // 丢弃旧请求的失败，不误导提示
      EMessage.error(error, '工单查询失败');
    } finally {
      if (token === listRequestToken) loading.value = false; // loading 只由最新请求结束
    }
  };

  const loadPageData = async (): Promise<void> => {
    await loadOrders();
  };

  const searchOrders = async (): Promise<void> => {
    currentPage.value = 1;
    await loadOrders();
  };

  const resetQuery = async (): Promise<void> => {
    Object.assign(query, { keyword: '', productId: '', status: '' });
    currentPage.value = 1;
    await loadOrders();
  };

  const handlePageSizeChange = async (value: number): Promise<void> => {
    pageSize.value = value;
    currentPage.value = 1;
    await loadOrders();
  };

  const handlePageChange = async (val: number): Promise<void> => {
    currentPage.value = val;
    await loadOrders();
  };

  return {
    orders,
    loading,
    total,
    currentPage,
    pageSize,
    query,
    loadOrders,
    loadPageData,
    searchOrders,
    resetQuery,
    handlePageSizeChange,
    handlePageChange,
  };
}
