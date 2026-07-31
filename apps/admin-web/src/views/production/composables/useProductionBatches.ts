import { reactive, ref } from 'vue';
import type {
  ProductOption,
  ProductionBatchItem,
  ProductionBatchStatus,
  TechnicalFileListItem,
  WorkOrderItem,
} from '@company/contracts';
import { productionApi } from '../../../api/production';
import { productApi } from '../../../api/product';
import { EMessage } from '../../../utils/message';
import { formatQuantity, getWorkOrderRemaining } from '../production-status';

export interface TaskRouteOption {
  id: string;
  routeName: string;
  versionNo: string;
  productId: string;
}

export interface TaskUserOption {
  id: string;
  displayName: string;
}

export function useProductionBatches() {
  const batches = ref<ProductionBatchItem[]>([]);
  const productOptions = ref<ProductOption[]>([]);
  const routeOptions = ref<TaskRouteOption[]>([]);
  const userOptions = ref<TaskUserOption[]>([]);
  const workOrderOptions = ref<WorkOrderItem[]>([]);
  const sopFileOptions = ref<TechnicalFileListItem[]>([]);
  const loading = ref(false);
  const workOrderLoading = ref(false);
  const total = ref(0);
  const currentPage = ref(1);
  const pageSize = ref(10);
  let optionsRequest: Promise<void> | null = null;
  let workOrderRequestToken = 0;

  const query = reactive<{ keyword: string; ownerId: string; status: string }>({
    keyword: '',
    ownerId: '',
    status: '',
  });

  /** 产品、路线、负责人、SOP 文件选项；并发请求合并为一次 */
  const loadOptions = (): Promise<void> => {
    if (!optionsRequest) {
      optionsRequest = (async () => {
        try {
          const [formOptions, userOpts, sopFiles] = await Promise.all([
            productApi.productFormOptions(),
            productApi.userOptions(),
            productApi
              .technicalFiles({ page: 1, pageSize: 100, status: 1 })
              .catch(() => ({ items: [], total: 0, page: 1, pageSize: 100 })),
          ]);
          productOptions.value = formOptions.products.filter(
            (item) => item.itemKind === 'finished_product',
          );
          routeOptions.value = formOptions.routes.map((item) => ({
            id: item.id,
            routeName: item.routeName,
            versionNo: item.versionNo,
            productId: item.productId,
          }));
          userOptions.value = userOpts;
          sopFileOptions.value = sopFiles.items;
        } catch {
          productOptions.value = [];
          routeOptions.value = [];
          userOptions.value = [];
          sopFileOptions.value = [];
        }
      })().finally(() => {
        optionsRequest = null;
      });
    }
    return optionsRequest;
  };

  const loadTasks = async (): Promise<void> => {
    loading.value = true;
    try {
      const page = await productionApi.listBatches({
        page: currentPage.value,
        pageSize: pageSize.value,
        keyword: query.keyword.trim() || undefined,
        ownerId: query.ownerId || undefined,
        status: (query.status || undefined) as ProductionBatchStatus | undefined,
      });
      batches.value = page.items;
      total.value = page.total;
    } catch (error) {
      EMessage.error(error, '生产批次查询失败');
    } finally {
      loading.value = false;
    }
  };

  const loadPageData = async (): Promise<void> => {
    await Promise.all([loadOptions(), loadTasks(), refreshWorkOrders()]);
  };

  const searchTasks = async (): Promise<void> => {
    currentPage.value = 1;
    await loadTasks();
  };

  const resetQuery = async (): Promise<void> => {
    Object.assign(query, { keyword: '', ownerId: '', status: '' });
    currentPage.value = 1;
    await loadTasks();
  };

  const handlePageSizeChange = async (): Promise<void> => {
    currentPage.value = 1;
    await loadTasks();
  };

  /** 已下达工单实时选项；以最后一次请求结果为准 */
  const searchWorkOrders = async (keyword: string): Promise<void> => {
    workOrderLoading.value = true;
    const token = ++workOrderRequestToken;
    try {
      const kw = keyword.trim();
      const released = await productionApi.listOrders({
        page: 1,
        pageSize: 50,
        status: 'released',
        keyword: kw || undefined,
      });
      if (token !== workOrderRequestToken) return;
      const map = new Map<string, WorkOrderItem>();
      for (const order of released.items) {
        if (getWorkOrderRemaining(order) > 0) map.set(order.id, order);
      }
      workOrderOptions.value = [...map.values()];
    } catch {
      /* best-effort */
    } finally {
      if (token === workOrderRequestToken) workOrderLoading.value = false;
    }
  };

  /** 无参包装：供弹窗 @open / @visible-change / onActivated 调用 */
  const refreshWorkOrders = (): void => {
    void searchWorkOrders('');
  };

  const formatRoute = (route: TaskRouteOption): string =>
    `${route.routeName}${route.versionNo ? ` / ${route.versionNo}` : ''}`;

  const formatWorkOrderOption = (order: WorkOrderItem): string =>
    `${order.workOrderNo} / ${order.productCode} / 剩余 ${formatQuantity(
      getWorkOrderRemaining(order),
    )}`;

  return {
    batches,
    productOptions,
    routeOptions,
    userOptions,
    workOrderOptions,
    sopFileOptions,
    loading,
    workOrderLoading,
    total,
    currentPage,
    pageSize,
    query,
    loadOptions,
    loadTasks,
    loadPageData,
    searchTasks,
    resetQuery,
    handlePageSizeChange,
    searchWorkOrders,
    refreshWorkOrders,
    formatRoute,
    formatWorkOrderOption,
  };
}
