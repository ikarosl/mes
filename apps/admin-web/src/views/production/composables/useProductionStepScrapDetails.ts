import { onActivated, reactive, ref, watch } from 'vue';
import type {
  BatchStepExecutionRecordItem,
  BatchStepScrapRecordView,
  ProductionExecutionRecordGroup,
} from '@company/contracts';
import { productionApi } from '../../../api/production';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { EMessage } from '../../../utils/message';

interface StepScrapDetailsOptions {
  contextId?: () => string | null;
  isReady?: () => boolean;
}
interface StepScrapDetailsTarget {
  productionBatchId: string;
  batchNo: string;
  stepRecordId: string;
  stepOrder: number;
  stepName: string;
}

/** 页级报废追溯独立分页；关闭、切目标和失活均使旧响应失效。 */
export const useProductionStepScrapDetails = (options: StepScrapDetailsOptions = {}) => {
  const visible = ref(false),
    loading = ref(false),
    errorText = ref('');
  const target = ref<StepScrapDetailsTarget | null>(null);
  const items = ref<BatchStepScrapRecordView[]>([]);
  const page = ref(1),
    total = ref(0);
  const pageSize = ref(10);
  const reads = useLatestReadRequest(() => (loading.value = false));
  const close = (): void => {
    reads.invalidate();
    visible.value = false;
    target.value = null;
    items.value = [];
    page.value = 1;
    pageSize.value = 10;
    total.value = 0;
    errorText.value = '';
  };
  const refresh = async (): Promise<void> => {
    const step = target.value;
    if (!visible.value || !step || !reads.isActive()) return;
    const requestedPageSize = pageSize.value;
    const { isCurrent, signal } = reads.begin(
      () => visible.value && target.value === step && pageSize.value === requestedPageSize,
    );
    loading.value = true;
    errorText.value = '';
    let requestedPage = page.value;
    try {
      // 仅纠正当前分页越界，不逐页扫描历史；持续变化时交给人员明确刷新。
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const result = await productionApi.listStepScrapRecords(
          step.productionBatchId,
          step.stepRecordId,
          { page: requestedPage, pageSize: requestedPageSize },
          { signal, skipErrorHandling: true },
        );
        if (!isCurrent()) return;
        if (
          result.page !== requestedPage ||
          result.pageSize !== requestedPageSize ||
          !Number.isSafeInteger(result.total) ||
          result.total < 0 ||
          result.items.some(
            (item) =>
              item.productionBatchId !== step.productionBatchId ||
              item.stepRecordId !== step.stepRecordId,
          )
        )
          throw new Error('报废记录与当前选择不一致');
        const lastPage = Math.max(1, Math.ceil(result.total / requestedPageSize));
        if (requestedPage > lastPage) {
          requestedPage = lastPage;
          page.value = lastPage;
          continue;
        }
        page.value = requestedPage;
        items.value = result.items;
        total.value = result.total;
        return;
      }
      throw new Error('报废记录分页窗口持续变化');
    } catch (error) {
      if (!isCurrent()) return;
      items.value = [];
      page.value = 1;
      total.value = 0;
      errorText.value = '报废记录加载失败，请重试。';
      EMessage.error(error, errorText.value);
    } finally {
      if (isCurrent()) loading.value = false;
    }
  };
  const changePage = (next: number): void => {
    if (!visible.value || loading.value || !reads.isActive() || next === page.value) return;
    if (!Number.isSafeInteger(next) || next < 1) return;
    page.value = next;
    void refresh();
  };
  const changePageSize = (next: number): void => {
    if (
      !visible.value ||
      !reads.isActive() ||
      ![10, 20, 50].includes(next) ||
      next === pageSize.value
    )
      return;
    reads.invalidate();
    pageSize.value = next;
    page.value = 1;
    void refresh();
  };
  const open = (
    batch: Pick<ProductionExecutionRecordGroup, 'productionBatchId' | 'batchNo'>,
    step: Pick<
      BatchStepExecutionRecordItem,
      'productionBatchId' | 'stepRecordId' | 'stepOrder' | 'stepName'
    >,
  ): void => {
    if (
      !reads.isActive() ||
      options.isReady?.() === false ||
      batch.productionBatchId !== step.productionBatchId ||
      (options.contextId && options.contextId() !== batch.productionBatchId)
    )
      return;
    reads.invalidate();
    target.value = {
      productionBatchId: step.productionBatchId,
      stepRecordId: step.stepRecordId,
      stepOrder: step.stepOrder,
      stepName: step.stepName,
      batchNo: batch.batchNo,
    };
    items.value = [];
    page.value = 1;
    pageSize.value = 10;
    total.value = 0;
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
    items,
    page,
    total,
    pageSize,
    close,
    refresh,
    changePage,
    changePageSize,
    open,
  });
};

export type ProductionStepScrapDetailsReader = ReturnType<typeof useProductionStepScrapDetails>;
