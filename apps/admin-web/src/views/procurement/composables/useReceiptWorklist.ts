import { ref, shallowRef } from 'vue';
import type { PageQuery, PageResult } from '@company/contracts';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { usePageInitialLoad } from '../../../composables/requests/usePageInitialLoad';
import { EMessage } from '../../../utils/message';

/** 两个到货工作列表共用读取生命周期；筛选和端点由各自消费方持有。 */
export function useReceiptWorklist<T>(options: {
  fetchPage: (page: PageQuery, signal: AbortSignal) => Promise<PageResult<T>>;
  resetFilters: () => void;
  errorMessage: string;
}) {
  const rows = shallowRef<T[]>([]);
  const page = ref(1),
    pageSize = ref(10),
    total = ref(0),
    loading = ref(false);
  const read = useLatestReadRequest(() => {
    loading.value = false;
  });
  const load = async (): Promise<void> => {
    if (!read.isActive()) return;
    const current = read.begin();
    loading.value = true;
    try {
      const result = await options.fetchPage(
        { page: page.value, pageSize: pageSize.value },
        current.signal,
      );
      if (!current.isCurrent()) return;
      rows.value = result.items;
      total.value = result.total;
    } catch (error) {
      if (current.isCurrent()) EMessage.error(error, options.errorMessage);
    } finally {
      if (current.isCurrent()) loading.value = false;
    }
  };
  const search = async (): Promise<void> => {
    page.value = 1;
    await load();
  };
  const reset = async (): Promise<void> => {
    options.resetFilters();
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
  usePageInitialLoad(load);
  return { rows, page, pageSize, total, loading, load, search, reset, changePage, changePageSize };
}
