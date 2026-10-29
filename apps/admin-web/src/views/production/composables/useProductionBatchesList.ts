import { reactive, ref } from 'vue';
import type { ProductionBatchItem, ProductionBatchStatus } from '@company/contracts';
import { productionApi } from '../../../api/production';
import { EMessage } from '../../../utils/message';

/**
 * 页面持有生产批次分页列表；人员、工单及路线候选由各消费入口持有。
 * 列表请求使用 last-request-wins（listRequestToken）：翻页/搜索并发时旧响应直接丢弃。
 */
export function useProductionBatchesList() {
  const batches = ref<ProductionBatchItem[]>([]);
  const loading = ref(false);
  const total = ref(0);
  const currentPage = ref(1);
  const pageSize = ref(10);
  let listRequestToken = 0;

  const query = reactive<{ keyword: string; ownerId: string; status: string }>({
    keyword: '',
    ownerId: '',
    status: '',
  });

  const loadTasks = async (): Promise<void> => {
    loading.value = true;
    const token = ++listRequestToken;
    try {
      const page = await productionApi.listBatches({
        page: currentPage.value,
        pageSize: pageSize.value,
        keyword: query.keyword.trim() || undefined,
        ownerId: query.ownerId || undefined,
        status: (query.status || undefined) as ProductionBatchStatus | undefined,
      });
      if (token !== listRequestToken) return; // 已有更新的请求，丢弃迟到响应
      batches.value = page.items;
      total.value = page.total;
    } catch (error) {
      if (token !== listRequestToken) return;
      EMessage.error(error, '生产批次查询失败');
    } finally {
      if (token === listRequestToken) loading.value = false;
    }
  };

  const loadPageData = loadTasks;

  const searchTasks = async (): Promise<void> => {
    currentPage.value = 1;
    await loadTasks();
  };

  const resetQuery = async (): Promise<void> => {
    Object.assign(query, { keyword: '', ownerId: '', status: '' });
    currentPage.value = 1;
    await loadTasks();
  };

  const handlePageSizeChange = async (value: number): Promise<void> => {
    pageSize.value = value;
    currentPage.value = 1;
    await loadTasks();
  };

  const handlePageChange = async (val: number): Promise<void> => {
    currentPage.value = val;
    await loadTasks();
  };

  return {
    batches,
    loading,
    total,
    currentPage,
    pageSize,
    query,
    loadTasks,
    loadPageData,
    searchTasks,
    resetQuery,
    handlePageSizeChange,
    handlePageChange,
  };
}
