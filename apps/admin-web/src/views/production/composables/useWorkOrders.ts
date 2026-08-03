import { computed, reactive, ref } from 'vue';
import type { WorkOrderItem, WorkOrderStatus } from '@company/contracts';
import { productionApi } from '../../../api/production';
import { useReferenceOptionsStore } from '../../../stores/reference-options';
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
  const store = useReferenceOptionsStore();
  const orders = ref<WorkOrderItem[]>([]);
  const loading = ref(false);
  const total = ref(0);
  const currentPage = ref(1);
  const pageSize = ref(10);

  /** 共享原始候选 → 页面业务投影（过滤/映射留在消费侧） */
  const productOptions = computed<WorkOrderProductOption[]>(() =>
    store.products
      .filter((item) => item.itemKind === 'finished_product')
      .map((item) => ({
        id: item.id,
        productName: item.productName,
        itemCode: item.itemCode,
      })),
  );
  const routeOptions = computed<WorkOrderRouteOption[]>(() =>
    store.routes.map((item) => ({
      id: item.id,
      routeName: item.routeName,
      version: item.versionNo,
      productId: item.productId,
    })),
  );
  const userOptions = computed<WorkOrderUserOption[]>(() => store.users);

  const query = reactive<{ keyword: string; productId: string; status: string }>({
    keyword: '',
    productId: '',
    status: '',
  });

  /** 首访：并发确保三类共享候选（命中缓存即返回，各自独立合并并发） */
  const ensureOptions = (): Promise<void> =>
    Promise.all([store.ensureProducts(), store.ensureRoutes(), store.ensureUsers()]).then(
      () => undefined,
    );
  /** 定向刷新：展开哪个下拉只刷新哪个资源（docs/frontend-architecture.md §6） */
  const refreshProducts = (): Promise<void> => store.refreshProducts();
  const refreshRoutes = (): Promise<void> => store.refreshRoutes();
  const refreshUsers = (): Promise<void> => store.refreshUsers();

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
    await Promise.all([ensureOptions(), loadOrders()]);
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
    ensureOptions,
    refreshProducts,
    refreshRoutes,
    refreshUsers,
    loadOrders,
    loadPageData,
    searchOrders,
    resetQuery,
    handlePageSizeChange,
    getOwnerName,
    formatProduct,
  };
}
