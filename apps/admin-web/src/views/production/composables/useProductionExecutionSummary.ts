import { computed, type Ref } from 'vue';
import type {
  ProductionExecutionBatchSummary,
  ProductionExecutionRecordGroup,
} from '@company/contracts';
import { executionBatchOverdueDays, executionBatchRiskClass } from '../production-execution-risk';

/** 任务的完整工序投影用于概览；报工详情分页不参与这些数量与状态的计算。 */
export const useProductionExecutionSummary = (
  record: Ref<ProductionExecutionRecordGroup | null>,
  batches: Ref<ProductionExecutionBatchSummary[]>,
  selectedBatchId: Ref<string | null>,
) => {
  const completedStepCount = computed(
    () => record.value?.steps.filter((step) => step.status === 'completed').length ?? 0,
  );
  const selectedBatch = computed(
    () => batches.value.find((batch) => batch.id === selectedBatchId.value) ?? null,
  );
  const stepProgressPercentage = computed(() =>
    record.value?.steps.length
      ? Math.round((completedStepCount.value / record.value.steps.length) * 100)
      : 0,
  );
  const reportHistoryCount = computed(
    () => record.value?.steps.reduce((sum, step) => sum + step.reportCount, 0) ?? 0,
  );
  const effectiveAbnormalQuantity = computed(
    () =>
      record.value?.steps.reduce((sum, step) => sum + Number(step.effectiveAbnormalQuantity), 0) ??
      0,
  );
  const currentStepLabel = computed(() => {
    const step =
      record.value?.steps.find((item) => item.status === 'doing') ??
      record.value?.steps.find((item) => item.status === 'assigned');
    return step ? `${step.stepOrder}. ${step.stepName}` : null;
  });
  const pendingAbnormalCount = computed(
    () =>
      record.value?.steps.reduce(
        (sum, step) =>
          sum +
          step.abnormalDispositions.filter((item) => item.reviewStatus === 'pending_review').length,
        0,
      ) ?? 0,
  );
  const selectedOverdueDays = computed(() =>
    selectedBatch.value ? executionBatchOverdueDays(selectedBatch.value) : 0,
  );
  const selectedBatchRiskClass = computed(() =>
    selectedBatch.value ? executionBatchRiskClass(selectedBatch.value) : '',
  );
  return {
    completedStepCount,
    selectedBatch,
    stepProgressPercentage,
    reportHistoryCount,
    effectiveAbnormalQuantity,
    currentStepLabel,
    pendingAbnormalCount,
    selectedOverdueDays,
    selectedBatchRiskClass,
  };
};
