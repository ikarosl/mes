import { ref } from 'vue';
import type {
  BatchStepExecutionRecordItem,
  BatchStepReportItem,
  ProductionExecutionBatchSummary,
  ProductionExecutionRecordGroup,
  ProductionExecutionCompletionCheck,
  BatchStepAbnormalDispositionItem,
  ReworkRecordItem,
} from '@company/contracts';
import { productionApi } from '../../../api/production';
import { useIdempotentIntent } from '../../../composables/idempotency/useIdempotentIntent';

export const useProductionExecutionRecords = () => {
  const batches = ref<ProductionExecutionBatchSummary[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const detailLoading = ref(false);
  const selectedBatchId = ref<string | null>(null);
  const record = ref<ProductionExecutionRecordGroup | null>(null);
  const completionCheck = ref<ProductionExecutionCompletionCheck | null>(null);
  const reworks = ref<ReworkRecordItem[]>([]);
  const pendingKeys = ref(new Set<string>());
  const correctionIntents = new Map<string, ReturnType<typeof useIdempotentIntent>>();
  const reworkCompletionIntents = new Map<string, ReturnType<typeof useIdempotentIntent>>();

  const loadBatches = async (keyword = '', page = 1): Promise<void> => {
    loading.value = true;
    try {
      const result = await productionApi.listExecutionBatchSummaries({
        keyword: keyword || undefined,
        page,
        pageSize: 20,
      });
      batches.value = result.items;
      total.value = result.total;
      if (!result.items.some((item) => item.id === selectedBatchId.value)) {
        record.value = null;
        completionCheck.value = null;
        reworks.value = [];
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
      const [nextRecord, nextCompletionCheck, nextReworks] = await Promise.all([
        productionApi.getBatchExecutionRecords(batchId),
        productionApi.getExecutionCompletionCheck(batchId),
        productionApi.listBatchReworks(batchId),
      ]);
      record.value = nextRecord;
      completionCheck.value = nextCompletionCheck;
      reworks.value = nextReworks;
      batches.value = batches.value.map((batch) =>
        batch.id === batchId
          ? {
              ...batch,
              status: nextRecord.batchStatus,
              completedStepCount: nextRecord.steps.filter((step) => step.status === 'completed')
                .length,
              totalStepCount: nextRecord.steps.length,
              effectiveAbnormalQuantity: nextRecord.steps
                .reduce((total, step) => total + Number(step.effectiveAbnormalQuantity), 0)
                .toFixed(4),
              pendingAbnormalCount: nextRecord.steps.reduce(
                (total, step) =>
                  total +
                  step.abnormalDispositions.filter((item) => item.reviewStatus === 'pending_review')
                    .length,
                0,
              ),
            }
          : batch,
      );
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
  const completeExecution = (): Promise<void> => {
    const check = completionCheck.value;
    if (!check) return Promise.resolve();
    return withPending(`complete:${check.productionBatchId}`, async () => {
      await productionApi.completeProductionExecution(check.productionBatchId, check.version);
      await selectBatch(check.productionBatchId);
    });
  };
  const approveRework = (
    disposition: BatchStepAbnormalDispositionItem,
    remark: string,
  ): Promise<void> =>
    withPending(`approve-rework:${disposition.dispositionId}`, async () => {
      await productionApi.approveDispositionRework(disposition.dispositionId, {
        version: disposition.version,
        remark: remark.trim() || null,
      });
      await selectBatch(disposition.productionBatchId);
    });
  const rejectDisposition = (
    disposition: BatchStepAbnormalDispositionItem,
    reason: string,
  ): Promise<void> =>
    withPending(`reject:${disposition.dispositionId}`, async () => {
      await productionApi.rejectAbnormalDisposition(disposition.dispositionId, {
        version: disposition.version,
        reason: reason.trim(),
      });
      await selectBatch(disposition.productionBatchId);
    });
  const startRework = (rework: ReworkRecordItem): Promise<void> =>
    withPending(`start-rework:${rework.reworkId}`, async () => {
      await productionApi.startRework(rework.reworkId, rework.version);
      await selectBatch(rework.productionBatchId);
    });
  const completeRework = (
    rework: ReworkRecordItem,
    normalQuantity: number,
    abnormalQuantity: number,
    remark: string,
  ): Promise<void> =>
    withPending(`complete-rework:${rework.reworkId}`, async () => {
      const body = {
        version: rework.version,
        normalQuantity,
        abnormalQuantity,
        remark: remark.trim() || null,
      };
      const intent = reworkCompletionIntents.get(rework.reworkId) ?? useIdempotentIntent();
      reworkCompletionIntents.set(rework.reworkId, intent);
      await intent.execute(
        {
          intentType: 'production.rework.complete',
          params: { reworkId: rework.reworkId },
          query: {},
          body,
        },
        (key) => productionApi.completeRework(rework.reworkId, body, key),
      );
      reworkCompletionIntents.delete(rework.reworkId);
      await selectBatch(rework.productionBatchId);
    });

  return {
    batches,
    total,
    loading,
    detailLoading,
    selectedBatchId,
    record,
    completionCheck,
    reworks,
    pendingKeys,
    loadBatches,
    selectBatch,
    reverse,
    correct,
    completeExecution,
    approveRework,
    rejectDisposition,
    startRework,
    completeRework,
  };
};
