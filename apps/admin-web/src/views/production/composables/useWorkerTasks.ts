import { computed, reactive, ref } from 'vue';
import type { ProductionWorkerTaskItem, ProductionWorkerTaskQuery } from '@company/contracts';
import { productionApi } from '../../../api/production';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { EMessage } from '../../../utils/message';

interface WorkerTaskFilterDraft {
  status: NonNullable<ProductionWorkerTaskQuery['status']> | '';
  batchNo: string;
  workOrderNo: string;
}

const emptyFilters = (): WorkerTaskFilterDraft => ({ status: '', batchNo: '', workOrderNo: '' });

export const useWorkerTasks = () => {
  const tasks = ref<ProductionWorkerTaskItem[]>([]);
  const loading = ref(false),
    total = ref(0),
    page = ref(1),
    pageSize = ref(10),
    errorText = ref('');
  const query = reactive(emptyFilters());
  const appliedFilters = ref<ProductionWorkerTaskQuery>({});
  const hasAppliedFilters = computed(
    () =>
      Boolean(appliedFilters.value.status) ||
      Boolean(appliedFilters.value.batchNo) ||
      Boolean(appliedFilters.value.workOrderNo),
  );
  const hasAppliedStatus = computed(() => Boolean(appliedFilters.value.status));
  const applyFilters = (): void => {
    appliedFilters.value = {
      status: query.status || undefined,
      batchNo: query.batchNo.trim() || undefined,
      workOrderNo: query.workOrderNo.trim() || undefined,
    };
    page.value = 1;
  };
  const clearFilters = (): void => {
    Object.assign(query, emptyFilters());
    appliedFilters.value = {};
    page.value = 1;
  };
  const reads = useLatestReadRequest(() => (loading.value = false));
  const load = async (): Promise<boolean> => {
    if (!reads.isActive()) return false;
    const filters = appliedFilters.value,
      requestedPageSize = pageSize.value;
    let requestedPage = page.value;
    const { isCurrent, signal } = reads.begin(
      () =>
        appliedFilters.value === filters &&
        page.value === requestedPage &&
        pageSize.value === requestedPageSize,
    );
    loading.value = true;
    errorText.value = '';
    try {
      while (isCurrent()) {
        const result = await productionApi.listWorkerTasks(
          { ...filters, page: requestedPage, pageSize: requestedPageSize },
          { skipErrorHandling: true, signal },
        );
        if (!isCurrent()) return false;
        const lastPage = Math.max(1, Math.ceil(result.total / requestedPageSize));
        if (requestedPage > lastPage) {
          requestedPage = lastPage;
          page.value = lastPage;
          if (result.total > 0) continue;
        }
        tasks.value = result.items;
        total.value = result.total;
        return true;
      }
      return false;
    } catch (error) {
      if (!isCurrent()) return false;
      tasks.value = [];
      total.value = 0;
      requestedPage = 1;
      page.value = 1;
      errorText.value = '本人任务刷新失败，旧操作依据已清除，请重试。';
      EMessage.error(error, errorText.value);
      return false;
    } finally {
      if (isCurrent()) loading.value = false;
    }
  };
  return {
    tasks,
    loading,
    total,
    page,
    pageSize,
    query,
    hasAppliedFilters,
    hasAppliedStatus,
    errorText,
    applyFilters,
    clearFilters,
    load,
  };
};
