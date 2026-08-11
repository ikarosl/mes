import { ref } from 'vue';
import type {
  BatchStepExecutionRecordItem,
  BatchStepReportItem,
  ProductionBatchItem,
  ProductionExecutionRecordGroup,
} from '@company/contracts';
import { productionApi } from '../../../api/production';
import { useIdempotentIntent } from '../../../composables/idempotency/useIdempotentIntent';

export const useProductionExecutionRecords = () => {
  const batches = ref<ProductionBatchItem[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const detailLoading = ref(false);
  const selectedBatchId = ref<string | null>(null);
  const record = ref<ProductionExecutionRecordGroup | null>(null);
  const pendingKeys = ref(new Set<string>());
  const correctionIntents = new Map<string, ReturnType<typeof useIdempotentIntent>>();

  const loadBatches = async (keyword = '', page = 1): Promise<void> => {
    loading.value = true;
    try {
      const result = await productionApi.listBatches({
        keyword: keyword || undefined,
        page,
        pageSize: 20,
      });
      batches.value = result.items;
      total.value = result.total;
      if (!result.items.some((item) => item.id === selectedBatchId.value)) {
        record.value = null;
        selectedBatchId.value = null;
        if (result.items[0]) await selectBatch(result.items[0].id);
      }
    } finally {
      loading.value = false;
    }
  };
  const selectBatch = async (batchId: string): Promise<void> => {
    selectedBatchId.value = batchId;
    detailLoading.value = true;
    try {
      record.value = await productionApi.getBatchExecutionRecords(batchId);
    } finally {
      detailLoading.value = false;
    }
  };
  const withPending = async (key: string, action: () => Promise<void>): Promise<void> => {
    if (pendingKeys.value.has(key)) return;
    pendingKeys.value = new Set(pendingKeys.value).add(key);
    try {
      await action();
    } finally {
      const next = new Set(pendingKeys.value);
      next.delete(key);
      pendingKeys.value = next;
    }
  };
  const reverse = (
    step: BatchStepExecutionRecordItem,
    report: BatchStepReportItem,
    reason: string,
  ): Promise<void> =>
    withPending(`reverse:${report.reportId}`, async () => {
      await productionApi.reverseStepReport(
        step.productionBatchId,
        step.stepRecordId,
        report.reportId,
        { version: step.version, reason: reason.trim() },
      );
      await selectBatch(step.productionBatchId);
    });
  const correct = (
    step: BatchStepExecutionRecordItem,
    report: BatchStepReportItem,
    normalQuantity: number,
    abnormalQuantity: number,
    reason: string,
  ): Promise<void> =>
    withPending(`correct:${report.reportId}`, async () => {
      const body = {
        version: step.version,
        normalQuantity,
        abnormalQuantity,
        reason: reason.trim(),
      };
      const intent = correctionIntents.get(report.reportId) ?? useIdempotentIntent();
      correctionIntents.set(report.reportId, intent);
      await intent.execute(
        {
          intentType: 'production.step-report.correct',
          params: {
            batchId: step.productionBatchId,
            stepRecordId: step.stepRecordId,
            reportId: report.reportId,
          },
          query: {},
          body,
        },
        (key) =>
          productionApi.correctStepReport(
            step.productionBatchId,
            step.stepRecordId,
            report.reportId,
            body,
            key,
          ),
      );
      correctionIntents.delete(report.reportId);
      await selectBatch(step.productionBatchId);
    });

  return {
    batches,
    total,
    loading,
    detailLoading,
    selectedBatchId,
    record,
    pendingKeys,
    loadBatches,
    selectBatch,
    reverse,
    correct,
  };
};
