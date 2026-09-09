import { reactive, ref } from 'vue';
import type { MaterialListItem } from '@company/contracts';
import { productApi } from '../../../api/product';
import { EMessage } from '../../../utils/message';

export function useMaterialsList() {
  const materials = ref<MaterialListItem[]>([]);
  const loading = ref(false);
  const total = ref(0);
  const currentPage = ref(1);
  const pageSize = ref(10);
  const query = reactive<{
    keyword: string;
    categoryId: string;
    status: '' | 'enabled' | 'disabled';
  }>({
    keyword: '',
    categoryId: '',
    status: '',
  });
  let requestToken = 0;

  const load = async (): Promise<void> => {
    const token = ++requestToken;
    loading.value = true;
    try {
      const result = await productApi.materialList({
        page: currentPage.value,
        pageSize: pageSize.value,
        keyword: query.keyword.trim() || undefined,
        categoryId: query.categoryId || undefined,
        status: query.status === '' ? undefined : query.status === 'enabled' ? 1 : 0,
      });
      if (token !== requestToken) return;
      materials.value = result.items;
      total.value = result.total;
    } catch (error) {
      if (token === requestToken) EMessage.error(error, '物料资料加载失败');
    } finally {
      if (token === requestToken) loading.value = false;
    }
  };

  const search = async () => {
    currentPage.value = 1;
    await load();
  };
  const reset = async () => {
    Object.assign(query, { keyword: '', categoryId: '', status: '' });
    currentPage.value = 1;
    await load();
  };
  const changePageSize = async (value: number) => {
    pageSize.value = value;
    currentPage.value = 1;
    await load();
  };
  const changePage = async (value: number) => {
    currentPage.value = value;
    await load();
  };

  return {
    materials,
    loading,
    total,
    currentPage,
    pageSize,
    query,
    load,
    search,
    reset,
    changePageSize,
    changePage,
  };
}
