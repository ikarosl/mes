import { reactive, ref } from 'vue';
import type { ProcessInspectionDispositionHistoryItem } from '@company/contracts';
import { productionProcessInspectionsApi } from '../../../api/production-process-inspections';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';

/** 历史以真实生产处置单分页，不能由当前待处理检查列表推算。 */
export function useProductionInspectionHistory(
  getContext: () => { batchId: string; stepId: string } | null,
) {
  const items = ref<ProcessInspectionDispositionHistoryItem[]>([]),
    loading = ref(false),
    error = ref(''),
    page = ref(1),
    pageSize = ref(10),
    total = ref(0);
  const read = useLatestReadRequest(() => {
    loading.value = false;
  });

  async function load(): Promise<void> {
    const target = getContext();
    if (!target || !read.isActive()) return;
    const current = read.begin(() => {
      const latest = getContext();
      return latest?.batchId === target.batchId && latest.stepId === target.stepId;
    });
    loading.value = true;
    error.value = '';
    try {
      let result = await productionProcessInspectionsApi.history(
        target.batchId,
        target.stepId,
        { page: page.value, pageSize: pageSize.value },
        current.signal,
      );
      if (!current.isCurrent()) return;
      const lastPage = Math.max(1, Math.ceil(result.total / pageSize.value));
      if (page.value > lastPage) {
        page.value = lastPage;
        result = await productionProcessInspectionsApi.history(
          target.batchId,
          target.stepId,
          { page: lastPage, pageSize: pageSize.value },
          current.signal,
        );
      }
      if (!current.isCurrent()) return;
      if (
        result.items.some(
          (item) =>
            item.productionBatchId !== target.batchId ||
            item.stepRecordId !== target.stepId ||
            item.sourceType !== 'process_inspection',
        )
      )
        throw new Error('历史处理记录与当前任务工序不一致');
      items.value = result.items;
      total.value = result.total;
    } catch (cause) {
      if (current.isCurrent())
        error.value = cause instanceof Error ? cause.message : '历史处理记录加载失败';
    } finally {
      if (current.isCurrent()) loading.value = false;
    }
  }
  function reset(): void {
    read.invalidate();
    items.value = [];
    error.value = '';
    page.value = 1;
    total.value = 0;
  }
  async function changePage(value: number): Promise<void> {
    page.value = value;
    await load();
  }
  async function changePageSize(value: number): Promise<void> {
    pageSize.value = value;
    await changePage(1);
  }
  return reactive({
    items,
    loading,
    error,
    page,
    pageSize,
    total,
    load,
    reset,
    changePage,
    changePageSize,
  });
}
