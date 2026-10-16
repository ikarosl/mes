import { ref, watch } from 'vue';
import type { ProcessInspectionEntry, ProcessInspectionStepSummary } from '@company/contracts';
import { processInspectionsApi } from '../../../api/process-inspections';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { useAuthStore } from '../../../stores/auth';

export function useProcessInspectionStep() {
  const visible = ref(false),
    targetId = ref('');
  const summary = ref<ProcessInspectionStepSummary | null>(null),
    loading = ref(false),
    error = ref('');
  const entries = ref<ProcessInspectionEntry[]>([]),
    entriesLoading = ref(false),
    entriesError = ref('');
  const page = ref(1),
    pageSize = ref(10),
    total = ref(0);
  const read = useLatestReadRequest(() => {
    loading.value = false;
  });
  const entriesRead = useLatestReadRequest(() => {
    entriesLoading.value = false;
  });

  async function loadSummary(): Promise<void> {
    if (!visible.value || !targetId.value || !read.isActive()) return;
    const stepId = targetId.value;
    const current = read.begin(() => visible.value && targetId.value === stepId);
    loading.value = true;
    error.value = '';
    try {
      const result = await processInspectionsApi.step(stepId, current.signal);
      if (!current.isCurrent()) return;
      if (result.stepId !== stepId) throw new Error('工序汇总与当前对象不一致');
      summary.value = result;
    } catch (failure) {
      if (current.isCurrent())
        error.value = failure instanceof Error ? failure.message : '工序汇总加载失败';
    } finally {
      if (current.isCurrent()) loading.value = false;
    }
  }
  async function loadEntries(): Promise<void> {
    if (!visible.value || !targetId.value || !entriesRead.isActive()) return;
    const stepId = targetId.value;
    const current = entriesRead.begin(() => visible.value && targetId.value === stepId);
    entriesLoading.value = true;
    entriesError.value = '';
    try {
      const result = await processInspectionsApi.entries(
        stepId,
        { page: page.value, pageSize: pageSize.value },
        current.signal,
      );
      if (!current.isCurrent()) return;
      if (result.items.some((row) => row.stepId !== stepId))
        throw new Error('检查明细与当前工序不一致');
      entries.value = result.items;
      total.value = result.total;
    } catch (failure) {
      if (current.isCurrent())
        entriesError.value = failure instanceof Error ? failure.message : '检查明细加载失败';
    } finally {
      if (current.isCurrent()) entriesLoading.value = false;
    }
  }
  async function refresh(): Promise<void> {
    await Promise.all([loadSummary(), loadEntries()]);
  }
  async function refreshAfterEntryChange(created: boolean): Promise<void> {
    if (!visible.value) return;
    if (created) page.value = 1;
    await refresh();
  }
  function close(): void {
    visible.value = false;
    read.invalidate();
    entriesRead.invalidate();
  }
  async function open(stepId: string): Promise<void> {
    close();
    targetId.value = stepId;
    summary.value = null;
    entries.value = [];
    error.value = '';
    entriesError.value = '';
    total.value = 0;
    page.value = 1;
    visible.value = true;
    await refresh();
  }
  async function changePage(value: number): Promise<void> {
    page.value = value;
    await loadEntries();
  }
  async function changePageSize(value: number): Promise<void> {
    pageSize.value = value;
    await changePage(1);
  }
  const auth = useAuthStore();
  watch(() => auth.session?.user.id, close);
  return {
    visible,
    targetId,
    summary,
    loading,
    error,
    entries,
    entriesLoading,
    entriesError,
    page,
    pageSize,
    total,
    open,
    close,
    refresh,
    refreshAfterEntryChange,
    changePage,
    changePageSize,
  };
}
