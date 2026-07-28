import { reactive, ref } from 'vue';
import { SYSTEM_STATUS } from '@company/constants';
import type {
  ProcessRouteOption,
  ProductCategoryListItem,
  ProductAcquireMethod,
  ProductItemKind,
  ProductListItem,
  ProductOption,
} from '@company/contracts';
import { productApi } from '../../../api/product';
import { EMessage } from '../../../utils/message';

export function useProducts() {
  const products = ref<ProductListItem[]>([]);
  const categoryOptions = ref<ProductCategoryListItem[]>([]);
  const materialOptions = ref<ProductOption[]>([]);
  const routes = ref<ProcessRouteOption[]>([]);
  const loading = ref(false);
  const total = ref(0);
  const currentPage = ref(1);
  const pageSize = ref(10);
  let optionsRequest: Promise<void> | null = null;
  const query = reactive<{
    keyword: string;
    categoryId: string;
    acquireMethod: ProductAcquireMethod | '';
    status: string;
  }>({ keyword: '', categoryId: '', acquireMethod: '', status: '' });

  const itemKindLabels: Record<ProductItemKind, string> = {
    material: '物料',
    semi_finished: '半成品',
    finished_product: '成品',
  };

  const itemKindLabel = (kind: ProductItemKind): string => itemKindLabels[kind];

  const canConfigureProduction = (
    row: Pick<ProductListItem, 'acquireMethod' | 'itemKind'>,
  ): boolean => row.acquireMethod === 'self_made' && row.itemKind !== 'material';

  const loadProducts = async (): Promise<void> => {
    loading.value = true;
    try {
      const result = await productApi.products({
        page: currentPage.value,
        pageSize: pageSize.value,
        keyword: query.keyword.trim() || undefined,
        categoryId: query.categoryId || undefined,
        acquireMethod: query.acquireMethod || undefined,
        status:
          query.status === 'enabled'
            ? SYSTEM_STATUS.enabled
            : query.status === 'disabled'
              ? SYSTEM_STATUS.disabled
              : undefined,
      });
      products.value = result.items;
      total.value = result.total;
    } catch (error) {
      EMessage.error(error, '产品资料加载失败');
    } finally {
      loading.value = false;
    }
  };

  const loadOptions = (): Promise<void> => {
    if (!optionsRequest) {
      optionsRequest = (async () => {
        try {
          const options = await productApi.productFormOptions();
          categoryOptions.value = options.categories.filter(
            (item: ProductCategoryListItem) => item.status === 1,
          );
          materialOptions.value = options.products.filter(
            (item: ProductOption) =>
              item.itemKind === 'material' || item.itemKind === 'semi_finished',
          );
          routes.value = options.routes;
        } catch (error) {
          EMessage.error(error, '产品选项加载失败');
        }
      })().finally(() => {
        optionsRequest = null;
      });
    }
    return optionsRequest;
  };

  const loadData = async (): Promise<void> => {
    await Promise.all([loadProducts(), loadOptions()]);
  };

  const handleSearch = async (): Promise<void> => {
    currentPage.value = 1;
    await loadProducts();
  };

  const resetQuery = async (): Promise<void> => {
    Object.assign(query, { keyword: '', categoryId: '', acquireMethod: '', status: '' });
    currentPage.value = 1;
    await loadProducts();
  };

  const handlePageSizeChange = async (val: number): Promise<void> => {
    pageSize.value = val;
    currentPage.value = 1;
    await loadProducts();
  };

  const handlePageChange = async (val: number): Promise<void> => {
    currentPage.value = val;
    await loadProducts();
  };

  const formatSpecItem = (item: { key: string; value: string; unit?: string }): string =>
    `${item.key}: ${item.value ?? '-'}${item.unit ? ` ${item.unit}` : ''}`;

  const formatSpecSummary = (
    items: Array<{ key: string; value: string; unit?: string }>,
  ): string => (!items?.length ? '-' : items.map(formatSpecItem).join('；'));

  return {
    products,
    categoryOptions,
    materialOptions,
    routes,
    loading,
    total,
    currentPage,
    pageSize,
    query,
    itemKindLabels,
    itemKindLabel,
    canConfigureProduction,
    loadProducts,
    loadOptions,
    loadData,
    handleSearch,
    resetQuery,
    handlePageSizeChange,
    handlePageChange,
    formatSpecItem,
    formatSpecSummary,
  };
}
