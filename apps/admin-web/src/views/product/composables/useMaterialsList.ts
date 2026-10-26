import { reactive, ref } from 'vue';
import type { MaterialListItem } from '@company/contracts';
import { productApi } from '../../../api/product';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { EMessage } from '../../../utils/message';

export function useMaterialsList(canRead: () => boolean = () => true) {
  const materials = ref<MaterialListItem[]>([]);
  const loading = ref(false);
  const total = ref(0);
  const currentPage = ref(1);
  const pageSize = ref(10);
  const snapshotRevision = ref(0);
  const query = reactive<{
    keyword: string;
    categoryId: string;
    status: '' | 'enabled' | 'disabled';
  }>({
    keyword: '',
    categoryId: '',
    status: '',
  });
  const reads = useLatestReadRequest(() => (loading.value = false));

  const load = async (): Promise<void> => {
    if (!reads.isActive() || !canRead()) return;
    const { isCurrent, signal } = reads.begin(canRead);
    loading.value = true;
    try {
      let status: 0 | 1 | undefined;
      if (query.status !== '') {
        if (query.status === 'enabled') status = 1;
        else status = 0;
      }
      const result = await productApi.materialList(
        {
          page: currentPage.value,
          pageSize: pageSize.value,
          keyword: query.keyword.trim() || undefined,
          categoryId: query.categoryId || undefined,
          status,
        },
        { signal, skipErrorHandling: true },
      );
      if (!isCurrent()) return;
      materials.value = result.items;
      total.value = result.total;
      snapshotRevision.value += 1;
    } catch (error) {
      if (isCurrent()) EMessage.error(error, '物料资料加载失败');
    } finally {
      if (isCurrent()) loading.value = false;
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
    snapshotRevision,
    query,
    load,
    search,
    reset,
    changePageSize,
    changePage,
    invalidate: reads.invalidate,
  };
}
