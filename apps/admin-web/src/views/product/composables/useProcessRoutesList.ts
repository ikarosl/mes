import { reactive, ref } from 'vue';
import type { ProcessRouteListItem, ProcessRouteStatus } from '@company/contracts';
import { productApi } from '../../../api/product';
import { EMessage } from '../../../utils/message';

/** 工艺路线页正式列表：查询、分页与列表加载。写操作成功后只调用 loadRoutes()。 */
export function useProcessRoutesList() {
  const routes = ref<ProcessRouteListItem[]>([]);
  const loading = ref(false);
  /** 列表请求代际：快速查询/翻页时丢弃旧响应（last-request-wins，见 frontend-architecture §7.3） */
  let listRequestToken = 0;
  const total = ref(0);
  const currentPage = ref(1);
  const pageSize = ref(10);
  const query = reactive<{ keyword: string; status: ProcessRouteStatus | '' }>({
    keyword: '',
    status: '',
  });

  const routeStatusLabels: Record<ProcessRouteStatus, string> = {
    draft: '草稿',
    enabled: '启用',
    disabled: '停用',
    archived: '已归档',
  };

  const routeStatusTypes: Record<ProcessRouteStatus, 'info' | 'success' | 'warning'> = {
    draft: 'info',
    enabled: 'success',
    disabled: 'warning',
    archived: 'info',
  };

  const routeStatusLabel = (status: ProcessRouteStatus): string => routeStatusLabels[status];
  const routeStatusType = (status: ProcessRouteStatus): 'info' | 'success' | 'warning' =>
    routeStatusTypes[status];

  const loadRoutes = async (): Promise<void> => {
    const token = ++listRequestToken;
    loading.value = true;
    try {
      const result = await productApi.routes({
        page: currentPage.value,
        pageSize: pageSize.value,
        keyword: query.keyword.trim() || undefined,
        status: query.status || undefined,
      });
      if (token !== listRequestToken) return; // 查询/翻页已变化，丢弃旧响应
      routes.value = result.items;
      total.value = result.total;
    } catch (error) {
      if (token !== listRequestToken) return; // 丢弃旧请求的失败，不误导提示
      EMessage.error(error, '工艺路线资料加载失败');
    } finally {
      if (token === listRequestToken) loading.value = false; // loading 只由最新请求结束
    }
  };

  const handleSearch = async (): Promise<void> => {
    currentPage.value = 1;
    await loadRoutes();
  };

  const resetQuery = async (): Promise<void> => {
    Object.assign(query, { keyword: '', status: '' });
    currentPage.value = 1;
    await loadRoutes();
  };

  const handlePageSizeChange = async (val: number): Promise<void> => {
    pageSize.value = val;
    currentPage.value = 1;
    await loadRoutes();
  };

  const handlePageChange = async (val: number): Promise<void> => {
    currentPage.value = val;
    await loadRoutes();
  };

  return {
    routes,
    loading,
    total,
    currentPage,
    pageSize,
    query,
    routeStatusLabel,
    routeStatusType,
    loadRoutes,
    handleSearch,
    resetQuery,
    handlePageSizeChange,
    handlePageChange,
  };
}
