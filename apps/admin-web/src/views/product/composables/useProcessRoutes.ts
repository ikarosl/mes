import { reactive, ref } from 'vue';
import type {
  ProcessRouteListItem,
  ProcessRouteStatus,
  ProcessStepListItem,
  ProductMaterialItem,
  ProductOption,
  UserOption,
} from '@company/contracts';
import { productApi } from '../../../api/product';
import { EMessage } from '../../../utils/message';

export function useProcessRoutes() {
  const routes = ref<ProcessRouteListItem[]>([]);
  const productOptions = ref<ProductOption[]>([]);
  const processOptions = ref<ProcessStepListItem[]>([]);
  const userOptions = ref<UserOption[]>([]);
  const routeMaterialOptions = ref<ProductMaterialItem[]>([]);
  const loading = ref(false);
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
    loading.value = true;
    try {
      const result = await productApi.routes({
        page: currentPage.value,
        pageSize: pageSize.value,
        keyword: query.keyword.trim() || undefined,
        status: query.status || undefined,
      });
      routes.value = result.items;
      total.value = result.total;
    } catch (error) {
      EMessage.error(error, '工艺路线资料加载失败');
    } finally {
      loading.value = false;
    }
  };

  const loadOptions = async (): Promise<void> => {
    try {
      const options = await productApi.routeFormOptions();
      productOptions.value = options.products.filter(
        (item: ProductOption) => item.acquireMethod === 'self_made' && item.itemKind !== 'material',
      );
      processOptions.value = options.processSteps.filter(
        (item: ProcessStepListItem) => item.status === 1,
      );
      userOptions.value = options.users;
    } catch (error) {
      EMessage.error(error, '工艺路线选项加载失败');
    }
  };

  const loadData = async (): Promise<void> => {
    await Promise.all([loadRoutes(), loadOptions()]);
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
    productOptions,
    processOptions,
    userOptions,
    routeMaterialOptions,
    loading,
    total,
    currentPage,
    pageSize,
    query,
    routeStatusLabel,
    routeStatusType,
    loadRoutes,
    loadOptions,
    loadData,
    handleSearch,
    resetQuery,
    handlePageSizeChange,
    handlePageChange,
  };
}
