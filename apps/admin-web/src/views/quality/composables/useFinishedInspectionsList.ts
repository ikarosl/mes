import { ref } from 'vue';
import type { FinishedInspectionTaskItem, FinishedInspectionTaskQuery } from '@company/contracts';
import { finishedInspectionsApi } from '../../../api/finished-inspections';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { usePageActivationRefresh } from '../../../composables/requests/usePageActivationRefresh';
import { EMessage } from '../../../utils/message';
export function useFinishedInspectionsList() {
  const keyword = ref(''),
    status = ref<NonNullable<FinishedInspectionTaskQuery['status']> | ''>('pending'),
    rows = ref<FinishedInspectionTaskItem[]>([]),
    page = ref(1),
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
      const result = await finishedInspectionsApi.list(
        {
          keyword: keyword.value.trim() || undefined,
          status: status.value || undefined,
          page: page.value,
          pageSize: pageSize.value,
        },
        current.signal,
      );
      if (current.isCurrent()) {
        rows.value = result.items;
        total.value = result.total;
      }
    } catch (error) {
      if (current.isCurrent()) EMessage.error(error, '成品质检任务加载失败');
    } finally {
      if (current.isCurrent()) loading.value = false;
    }
  };
  const search = async (): Promise<void> => {
    page.value = 1;
    await load();
  };
  const reset = async (): Promise<void> => {
    keyword.value = '';
    status.value = 'pending';
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
    keyword,
    status,
    rows,
    page,
    pageSize,
    total,
    loading,
    load,
    search,
    reset,
    changePage,
    changePageSize,
  };
}
