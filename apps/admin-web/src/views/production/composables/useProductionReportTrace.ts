import { onActivated, reactive, ref, watch } from 'vue';
import type { BatchStepReportDetail, BatchStepReportReference } from '@company/contracts';
import { productionApi } from '../../../api/production';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { EMessage } from '../../../utils/message';

interface ProductionReportTraceOptions {
  contextId?: () => string | null;
}

/** 页级只读查看持有详情与读取资格；表格及分组只提供入口。 */
export const useProductionReportTrace = (options: ProductionReportTraceOptions = {}) => {
  const visible = ref(false),
    loading = ref(false),
    errorText = ref('');
  const target = ref<BatchStepReportReference | null>(null);
  const detail = ref<BatchStepReportDetail | null>(null);
  const expansion = ref<Record<string, boolean>>({});
  const setExpansion = (next: Record<string, boolean>): void => {
    expansion.value = next;
  };
  const reads = useLatestReadRequest(() => (loading.value = false));
  const close = (): void => {
    reads.invalidate();
    visible.value = false;
    target.value = null;
    detail.value = null;
    errorText.value = '';
    expansion.value = {};
  };
  const refresh = async (): Promise<void> => {
    const report = target.value;
    if (!visible.value || !report || !reads.isActive()) return;
    const { isCurrent, signal } = reads.begin(() => visible.value && target.value === report);
    loading.value = true;
    errorText.value = '';
    try {
      const result = await productionApi.getStepReportDetail(
        report.productionBatchId,
        report.stepRecordId,
        report.reportId,
        { signal, skipErrorHandling: true },
      );
      if (!isCurrent()) return;
      if (
        result.productionBatchId !== report.productionBatchId ||
        result.stepRecordId !== report.stepRecordId ||
        result.reportId !== report.reportId
      )
        throw new Error('报工详情与当前选择不一致');
      detail.value = result;
    } catch (error) {
      if (!isCurrent()) return;
      detail.value = null;
      errorText.value = '报工详情加载失败，请重试。';
      EMessage.error(error, errorText.value);
    } finally {
      if (isCurrent()) loading.value = false;
    }
  };
  const open = (report: BatchStepReportReference): void => {
    if (!reads.isActive()) return;
    reads.invalidate();
    target.value = { ...report };
    detail.value = null;
    expansion.value = {};
    visible.value = true;
    void refresh();
  };
  if (options.contextId) watch(options.contextId, close, { flush: 'sync' });
  let hasActivated = false;
  onActivated(() => {
    if (hasActivated && visible.value) void refresh();
    hasActivated = true;
  });
  return reactive({
    visible,
    loading,
    errorText,
    target,
    detail,
    expansion,
    setExpansion,
    close,
    refresh,
    open,
  });
};

export type ProductionReportTraceReader = ReturnType<typeof useProductionReportTrace>;
