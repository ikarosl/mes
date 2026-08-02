import { reactive, ref } from 'vue';
import type { WorkOrderItem, WorkOrderStatus } from '@company/contracts';
import { productionApi } from '../../../api/production';
import { productApi } from '../../../api/product';
import { EMessage } from '../../../utils/message';

export interface WorkOrderProductOption {
  id: string;
  productName: string;
  itemCode: string;
}

export interface WorkOrderUserOption {
  id: string;
  displayName: string;
}

export interface WorkOrderRouteOption {
  id: string;
  routeName: string;
  version: string;
  productId: string;
}

export function useWorkOrders() {
  const orders = ref<WorkOrderItem[]>([]);
  const productOptions = ref<WorkOrderProductOption[]>([]);
  const routeOptions = ref<WorkOrderRouteOption[]>([]);
  const userOptions = ref<WorkOrderUserOption[]>([]);
  const loading = ref(false);
  const total = ref(0);
  const currentPage = ref(1);
  const pageSize = ref(10);
  let optionsRequest: Promise<void> | null = null;

  const query = reactive<{ keyword: string; productId: string; status: string }>({
    keyword: '',
    productId: '',
    status: '',
  });

  /** 产品、路线、负责人选项；并发请求合并为一次 */
  const loadOptions = (): Promise<void> => {
    if (!optionsRequest) {
      optionsRequest = (async () => {
        try {
          const [products, routes, userOpts] = await Promise.all([
            productApi.productOptions(),
            productApi.routeOptions(),
            productApi.userOptions(),
          ]);
          productOptions.value = products
            .filter((item) => item.itemKind === 'finished_product')
            .map((item) => ({
              id: item.id,
              productName: item.productName,
              itemCode: item.itemCode,
            }));
          routeOptions.value = routes.map((item) => ({
            id: item.id,
            routeName: item.routeName,
            version: item.versionNo,
            productId: item.productId,
          }));
          userOptions.value = userOpts;
        } catch {
          productOptions.value = [];
          routeOptions.value = [];
          userOptions.value = [];
        }
      })().finally(() => {
        optionsRequest = null;
      });
    }
    return optionsRequest;
  };

  const loadOrders = async (): Promise<void> => {
    loading.value = true;
    try {
      const page = await productionApi.listOrders({
        page: currentPage.value,
        pageSize: pageSize.value,
        keyword: query.keyword.trim() || undefined,
        productId: query.productId || undefined,
        status: (query.status || undefined) as WorkOrderStatus | undefined,
      });
      orders.value = page.items;
      total.value = page.total;
    } catch (error) {
      EMessage.error(error, '工单查询失败');
    } finally {
      loading.value = false;
    }
  };

  const loadPageData = async (): Promise<void> => {
    await Promise.all([loadOptions(), loadOrders()]);
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

  const handlePageSizeChange = async (): Promise<void> => {
    currentPage.value = 1;
    await loadOrders();
  };

  const getOwnerName = (ownerId: string | null | undefined): string => {
    if (!ownerId) return '-';
    return userOptions.value.find((user) => user.id === ownerId)?.displayName ?? '-';
  };

  const formatProduct = (product: WorkOrderProductOption): string =>
    `${product.itemCode} / ${product.productName}`;

  return {
    orders,
    productOptions,
    routeOptions,
    userOptions,
    loading,
    total,
    currentPage,
    pageSize,
    query,
    loadOptions,
    loadOrders,
    loadPageData,
    searchOrders,
    resetQuery,
    handlePageSizeChange,
    getOwnerName,
    formatProduct,
  };
}
