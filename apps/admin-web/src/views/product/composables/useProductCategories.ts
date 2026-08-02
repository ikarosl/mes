import { reactive, ref } from 'vue';
import { SYSTEM_STATUS } from '@company/constants';
import type {
  ProductCategoryListItem,
  ProductCategoryOption,
  ProductCategoryQuery,
} from '@company/contracts';
import { productApi } from '../../../api/product';
import { EMessage } from '../../../utils/message';

export function useProductCategories() {
  const categories = ref<ProductCategoryListItem[]>([]);
  const categoryOptions = ref<ProductCategoryOption[]>([]);
  const loading = ref(false);
  const total = ref(0);
  const currentPage = ref(1);
  const pageSize = ref(10);
  const query = reactive<{ categoryCode: string; categoryName: string; status: string }>({
    categoryCode: '',
    categoryName: '',
    status: '',
  });
  let optionsRequest: Promise<void> | null = null;

  const loadCategories = async (): Promise<void> => {
    loading.value = true;
    try {
      const params: ProductCategoryQuery = {
        page: currentPage.value,
        pageSize: pageSize.value,
        categoryCode: query.categoryCode.trim() || undefined,
        categoryName: query.categoryName.trim() || undefined,
        status:
          query.status === 'enabled'
            ? SYSTEM_STATUS.enabled
            : query.status === 'disabled'
              ? SYSTEM_STATUS.disabled
              : undefined,
      };
      const result = await productApi.categories(params);
      categories.value = result.items;
      total.value = result.total;
    } catch (error) {
      EMessage.error(error, '产品分类加载失败');
    } finally {
      loading.value = false;
    }
  };

  /** 父分类下拉选项；与分页列表解耦，并发请求合并为一次 */
  const loadCategoryOptions = (): Promise<void> => {
    if (!optionsRequest) {
      optionsRequest = (async () => {
        try {
          categoryOptions.value = await productApi.categoryOptions();
        } catch (error) {
          EMessage.error(error, '产品分类选项加载失败');
        }
      })().finally(() => {
        optionsRequest = null;
      });
    }
    return optionsRequest;
  };
  const refreshCategoryOptions = (visible = true): void => {
    if (visible) void loadCategoryOptions();
  };

  const handleSearch = async (): Promise<void> => {
    currentPage.value = 1;
    await loadCategories();
  };
  const resetQuery = async (): Promise<void> => {
    Object.assign(query, { categoryCode: '', categoryName: '', status: '' });
    currentPage.value = 1;
    await loadCategories();
  };
  const handlePageSizeChange = async (val: number): Promise<void> => {
    pageSize.value = val;
    currentPage.value = 1;
    await loadCategories();
  };
  const handlePageChange = async (val: number): Promise<void> => {
    currentPage.value = val;
    await loadCategories();
  };

  return {
    categories,
    categoryOptions,
    loading,
    total,
    currentPage,
    pageSize,
    query,
    loadCategories,
    loadCategoryOptions,
    refreshCategoryOptions,
    handleSearch,
    resetQuery,
    handlePageSizeChange,
    handlePageChange,
  };
}
