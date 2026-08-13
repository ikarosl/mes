import { reactive, ref } from 'vue';
import type {
  ProductionBatchItem,
  ProductionBatchStatus,
  TechnicalFileListItem,
} from '@company/contracts';
import { productionApi } from '../../../api/production';
import { productApi } from '../../../api/product';
import { EMessage } from '../../../utils/message';

/**
 * 生产批次正式列表（页面持有）。候选数据全部迁出到消费方本地 composable：
 *  - 负责人候选：页面持 useUserOptions，见 ProductionTasksPage。
 *  - 工单候选：TaskFormDialog 自持 useWorkOrderOptions。
 *  - 产品/路线候选：TaskFormDialog 自持 useProductOptions / useProcessRouteOptions。
 *  - SOP 文件候选为页面本地选项（best-effort，单飞去重），保持现状。
 *
 * 列表请求使用 last-request-wins（listRequestToken）：翻页/搜索并发时旧响应直接丢弃。
 */
export function useProductionBatchesList() {
  const batches = ref<ProductionBatchItem[]>([]);
  const sopFileOptions = ref<TechnicalFileListItem[]>([]);
  const loading = ref(false);
  const total = ref(0);
  const currentPage = ref(1);
  const pageSize = ref(10);
  let sopRequest: Promise<void> | null = null;
  let listRequestToken = 0;

  const query = reactive<{ keyword: string; ownerId: string; status: string }>({
    keyword: '',
    ownerId: '',
    status: '',
  });

  /** SOP 文件候选为本地页面选项（best-effort，单飞去重） */
  const loadSopFiles = (): Promise<void> => {
    if (sopRequest) return sopRequest;
    sopRequest = productApi
      .technicalFiles({ page: 1, pageSize: 100, status: 1 })
      .then((page) => {
        sopFileOptions.value = page.items;
      })
      .catch(() => {
        sopFileOptions.value = [];
        EMessage.warning('SOP 文件选项加载失败，下拉可能为空');
      })
      .finally(() => {
        sopRequest = null;
      });
    return sopRequest;
  };

  /** SOP 文件候选：单飞去重，每次下拉展开都重新请求 */
  const refreshSopFiles = (): Promise<void> => loadSopFiles();

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
    sopFileOptions,
    loading,
    total,
    currentPage,
    pageSize,
    query,
    refreshSopFiles,
    loadTasks,
    loadPageData,
    searchTasks,
    resetQuery,
    handlePageSizeChange,
    handlePageChange,
  };
}
