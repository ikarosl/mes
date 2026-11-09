import { reactive, ref } from 'vue';
import type { ProductionBatchItem, ProductionBatchStatus } from '@company/contracts';
import { productionTasksApi } from '../../../api/production/tasks';
import { EMessage } from '../../../utils/message';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';

/**
 * 页面持有生产批次分页列表；人员、工单及路线候选由各消费入口持有。
 * 列表读取由页面生命周期和请求代际守卫，翻页或换筛选丢弃旧结果。
 */
export function useProductionBatchesList() {
  const batches = ref<ProductionBatchItem[]>([]);
  const loading = ref(false);
  const total = ref(0);
  const currentPage = ref(1);
  const pageSize = ref(10);
  const reads = useLatestReadRequest(() => {
    loading.value = false;
  });

  const query = reactive<{ keyword: string; ownerId: string; status: ProductionBatchStatus | '' }>({
    keyword: '',
    ownerId: '',
    status: '',
  });

  const loadTasks = async (): Promise<void> => {
    if (!reads.isActive()) return;
    const read = reads.begin();
    loading.value = true;
    try {
      const page = await productionTasksApi.listBatches(
        {
          page: currentPage.value,
          pageSize: pageSize.value,
          keyword: query.keyword.trim() || undefined,
          ownerId: query.ownerId || undefined,
          status: query.status || undefined,
        },
        { signal: read.signal, skipErrorHandling: true },
      );
      if (!read.isCurrent()) return; // 已有更新的请求，丢弃迟到响应
      batches.value = page.items;
      total.value = page.total;
    } catch (error) {
      if (!read.isCurrent()) return;
      EMessage.error(error, '生产批次查询失败');
    } finally {
      if (read.isCurrent()) loading.value = false;
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
