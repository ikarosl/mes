import { reactive, ref } from 'vue';
import { SYSTEM_STATUS } from '@company/constants';
import type { ProductAcquireMethod, ProductItemKind, ProductListItem } from '@company/contracts';
import { productApi } from '../../../api/product';
import { EMessage } from '../../../utils/message';

/** 产品页正式列表：查询、分页与列表加载。写操作成功后只调用 loadProducts()。 */
export function useProductsList() {
  const products = ref<ProductListItem[]>([]);
  const loading = ref(false);
  /** 列表请求代际：快速查询/翻页时丢弃旧响应（last-request-wins，见 frontend-architecture §7.3） */
  let listRequestToken = 0;
  const total = ref(0);
  const currentPage = ref(1);
  const pageSize = ref(10);
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
    const token = ++listRequestToken;
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
      if (token !== listRequestToken) return; // 查询/翻页已变化，丢弃旧响应
      products.value = result.items;
      total.value = result.total;
    } catch (error) {
      if (token !== listRequestToken) return; // 丢弃旧请求的失败，不误导提示
      EMessage.error(error, '产品资料加载失败');
    } finally {
      if (token === listRequestToken) loading.value = false; // loading 只由最新请求结束
    }
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
    loading,
    total,
    currentPage,
    pageSize,
    query,
    itemKindLabels,
    itemKindLabel,
    canConfigureProduction,
    loadProducts,
    handleSearch,
    resetQuery,
    handlePageSizeChange,
    handlePageChange,
    formatSpecItem,
    formatSpecSummary,
  };
}
