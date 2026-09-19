import { reactive, ref } from 'vue';
import type { SupplierItem } from '@company/contracts';
import { procurementApi } from '../../../api/procurement';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { usePageActivationRefresh } from '../../../composables/requests/usePageActivationRefresh';
import { EMessage } from '../../../utils/message';

export function useSuppliersList() {
  const query = reactive({ keyword: '' });
  const rows = ref<SupplierItem[]>([]);
  const total = ref(0);
  const page = ref(1);
  const pageSize = ref(10);
  const loading = ref(false);
  const request = useLatestReadRequest(() => {
    loading.value = false;
  });

  const load = async (): Promise<void> => {
    if (!request.isActive()) return;
    const current = request.begin();
    loading.value = true;
    try {
      const result = await procurementApi.listSuppliers(
        { page: page.value, pageSize: pageSize.value, keyword: query.keyword.trim() || undefined },
        current.signal,
      );
      if (!current.isCurrent()) return;
      rows.value = result.items;
      total.value = result.total;
    } catch (error) {
      if (current.isCurrent()) EMessage.error(error, '供应商列表加载失败');
    } finally {
      if (current.isCurrent()) loading.value = false;
    }
  };

  const search = async (): Promise<void> => {
    page.value = 1;
    await load();
  };
  const reset = async (): Promise<void> => {
    query.keyword = '';
    await search();
  };
  const changePage = async (value: number): Promise<void> => {
    page.value = value;
    await load();
  };
  const changePageSize = async (value: number): Promise<void> => {
    pageSize.value = value;
    await search();
  };

  usePageActivationRefresh(load);
  return {
    query,
    rows,
    total,
    page,
    pageSize,
    loading,
    load,
    search,
    reset,
    changePage,
    changePageSize,
  };
}
