import { EMessage } from '../../../utils/message';
import { ref, watch } from 'vue';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import type {
  ProductionExecutionBatchSummary,
  ProductionExecutionRecordGroup,
  ProductionExecutionCompletionCheck,
  BatchStepAbnormalDispositionItem,
  ReworkRecordItem,
  ReworkRecordView,
  ApproveScrapSupplementLinePayload,
  ProductionScrapSupplementPlanItem,
  CompleteReworkPayload,
} from '@company/contracts';
import { productionApi } from '../../../api/production';
import {
  isAmbiguousFailure,
  useIdempotentIntent,
} from '../../../composables/idempotency/useIdempotentIntent';

export interface ProductionReworkCompletionRequest {
  rework: ReworkRecordItem;
  body: CompleteReworkPayload;
}

export const useProductionExecutionRecords = () => {
  const batches = ref<ProductionExecutionBatchSummary[]>([]);
  const total = ref(0);
  const pageSize = 10;
  const loading = ref(false);
  const listErrorText = ref('');
  const detailLoading = ref(false);
  const selectedBatchId = ref<string | null>(null);
  const record = ref<ProductionExecutionRecordGroup | null>(null);
  const completionCheck = ref<ProductionExecutionCompletionCheck | null>(null);
  const reworks = ref<ReworkRecordView[]>([]);
  const pendingKeys = ref(new Set<string>());
  const reworkCompletionIntents = new Map<
    string,
    { intent: ReturnType<typeof useIdempotentIntent>; request: ProductionReworkCompletionRequest }
  >();
  const supplementIntents = new Map<string, ReturnType<typeof useIdempotentIntent>>();

  const listRequests = useLatestReadRequest(() => (loading.value = false));
  const detailRequests = useLatestReadRequest(() => (detailLoading.value = false));
  const clearCurrentDetails = (): void => {
    detailRequests.invalidate();
    record.value = null;
    completionCheck.value = null;
    reworks.value = [];
  };
  watch(
    selectedBatchId,
    () => {
      clearCurrentDetails();
    },
    { flush: 'sync' },
  );

  let listKeyword = '',
    listPage = 1;
  const loadBatches = async (
    keyword = '',
    page = 1,
    options: { preserveSelection?: boolean } = {},
  ): Promise<number | null> => {
    if (!listRequests.isActive()) return null;
    const queryKeyword = keyword.trim();
    detailRequests.invalidate();
    if (listKeyword !== queryKeyword || listPage !== page) clearCurrentDetails();
    listKeyword = queryKeyword;
    listPage = page;
    const { isCurrent, signal } = listRequests.begin();
    loading.value = true;
    listErrorText.value = '';
    try {
      const result = await productionApi.listExecutionBatchSummaries(
        {
          keyword: queryKeyword || undefined,
          page,
          pageSize,
        },
        { skipErrorHandling: true, signal },
      );
      if (!isCurrent()) return null;
      batches.value = result.items;
      total.value = result.total;
      if (selectedBatchId.value && result.items.some((item) => item.id === selectedBatchId.value)) {
        await selectBatch(selectedBatchId.value);
      } else {
        clearCurrentDetails();
        // 激活刷新不能因分页窗口变化自动换任务或关闭尚未确认的写意图。
        if (options.preserveSelection && selectedBatchId.value) {
          await selectBatch(selectedBatchId.value);
          return isCurrent() ? result.total : null;
        }
        selectedBatchId.value = null;
        if (result.items[0]) await selectBatch(result.items[0].id);
      }
      return isCurrent() ? result.total : null;
    } catch (error) {
      if (isCurrent()) {
        batches.value = [];
        total.value = 0;
        clearCurrentDetails();
        listErrorText.value = '生产批次加载失败，旧操作依据已清除，请重试。';
        EMessage.error(error, listErrorText.value);
      }
      return null;
    } finally {
      if (isCurrent()) loading.value = false;
    }
  };
  const selectBatch = async (batchId: string): Promise<void> => {
    if (!detailRequests.isActive()) return;
    selectedBatchId.value = batchId;
    const { isCurrent, signal } = detailRequests.begin(() => selectedBatchId.value === batchId);
    // 仅目标变化时清空；同一批次刷新复用表格，加载期间 requireCurrentBatch 阻止写入。
    detailLoading.value = true;
    try {
      const [nextRecord, nextCompletionCheck, nextReworks] = await Promise.all([
        productionApi.getBatchExecutionRecords(batchId, { skipErrorHandling: true, signal }),
        productionApi.getExecutionCompletionCheck(batchId, { skipErrorHandling: true, signal }),
        productionApi.listBatchReworks(batchId, { skipErrorHandling: true, signal }),
      ]);
      if (!isCurrent()) return;
      if (
        nextRecord.productionBatchId !== batchId ||
        nextCompletionCheck.productionBatchId !== batchId
      )
        throw new Error('批次详情与当前选择不一致，请刷新');
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
                .toFixed(0),
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
    } catch (error) {
      if (isCurrent()) {
        // 刷新失败不能继续用旧完工检查和旧版本操作。
        record.value = null;
        completionCheck.value = null;
        reworks.value = [];
        EMessage.error(error, '加载失败，请重试');
      }
    } finally {
      if (isCurrent()) detailLoading.value = false;
    }
  };
  const requireCurrentBatch = (batchId: string): void => {
    if (
      !detailRequests.isActive() ||
      loading.value ||
      detailLoading.value ||
      selectedBatchId.value !== batchId ||
      record.value?.productionBatchId !== batchId
    )
      throw new Error('当前批次详情已变化或正在加载，请重新选择操作');
  };
  const refreshSelectedBatch = async (batchId: string): Promise<void> => {
    if (selectedBatchId.value === batchId) await selectBatch(batchId);
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
  const completeExecution = (): Promise<void> => {
    const check = completionCheck.value;
    if (!check) return Promise.resolve();
    return withPending(`complete:${check.productionBatchId}`, async () => {
      requireCurrentBatch(check.productionBatchId);
      await productionApi.completeProductionExecution(check.productionBatchId, check.version);
      await refreshSelectedBatch(check.productionBatchId);
    });
  };
  const approveRework = (
    disposition: BatchStepAbnormalDispositionItem,
    remark: string,
  ): Promise<void> =>
    withPending(`approve-rework:${disposition.dispositionId}`, async () => {
      requireCurrentBatch(disposition.productionBatchId);
      await productionApi.approveDispositionRework(disposition.dispositionId, {
        version: disposition.version,
        remark: remark.trim() || null,
      });
      await refreshSelectedBatch(disposition.productionBatchId);
    });
  const rejectDisposition = (
    disposition: BatchStepAbnormalDispositionItem,
    reason: string,
  ): Promise<void> =>
    withPending(`reject:${disposition.dispositionId}`, async () => {
      requireCurrentBatch(disposition.productionBatchId);
      await productionApi.rejectAbnormalDisposition(disposition.dispositionId, {
        version: disposition.version,
        reason: reason.trim(),
      });
      await refreshSelectedBatch(disposition.productionBatchId);
    });
  const startRework = (rework: ReworkRecordItem): Promise<void> =>
    withPending(`start-rework:${rework.reworkId}`, async () => {
      requireCurrentBatch(rework.productionBatchId);
      await productionApi.startRework(rework.reworkId, rework.version);
      await refreshSelectedBatch(rework.productionBatchId);
    });
  const completeRework = (
    rework: ReworkRecordItem,
    normalQuantity: number,
    abnormalQuantity: number,
    remark: string,
  ): Promise<void> =>
    withPending(`complete-rework:${rework.reworkId}`, async () => {
      let entry = reworkCompletionIntents.get(rework.reworkId);
      if (!entry || entry.intent.getStatus() === 'idle') {
        requireCurrentBatch(rework.productionBatchId);
        const current = reworks.value.find((item) => item.reworkId === rework.reworkId);
        if (
          record.value?.batchStatus !== 'doing' ||
          record.value.pendingApprovalId !== null ||
          current?.status !== 'doing' ||
          current.version !== rework.version ||
          current.productionBatchId !== rework.productionBatchId ||
          current.responsibleUserId !== rework.responsibleUserId ||
          current.reworkQuantity !== rework.reworkQuantity
        )
          throw new Error('当前返工或任务已不能新登记完成结果，请刷新后核对');
        entry = {
          intent: useIdempotentIntent('返工完成结果'),
          request: {
            rework: { ...rework },
            body: {
              version: rework.version,
              normalQuantity,
              abnormalQuantity,
              remark: remark.trim() || null,
            },
          },
        };
        reworkCompletionIntents.set(rework.reworkId, entry);
      } else if (
        !detailRequests.isActive() ||
        selectedBatchId.value !== entry.request.rework.productionBatchId
      ) {
        throw new Error('请返回原任务核对或按原请求重试返工完成结果');
      }
      const { intent, request } = entry;
      try {
        await intent.execute(
          {
            intentType: 'production.rework.complete',
            params: { reworkId: request.rework.reworkId },
            query: {},
            body: request.body,
          },
          (key) => productionApi.completeRework(request.rework.reworkId, request.body, key),
        );
      } catch (error) {
        if (intent.getStatus() === 'idle') reworkCompletionIntents.delete(rework.reworkId);
        throw error;
      }
      reworkCompletionIntents.delete(rework.reworkId);
      await refreshSelectedBatch(request.rework.productionBatchId);
    });
  const getReworkCompletionIntentStatus = (reworkId: string) =>
    reworkCompletionIntents.get(reworkId)?.intent.getStatus() ?? 'idle';
  const getReworkCompletionRequest = (
    reworkId: string,
  ): ProductionReworkCompletionRequest | null => {
    const request = reworkCompletionIntents.get(reworkId)?.request;
    return request ? { rework: { ...request.rework }, body: { ...request.body } } : null;
  };
  const getReworkCompletionRequests = (): ProductionReworkCompletionRequest[] =>
    [...reworkCompletionIntents.values()].map(({ request }) => ({
      rework: { ...request.rework },
      body: { ...request.body },
    }));
  const resetReworkCompletionIntent = (reworkId: string): void => {
    if (pendingKeys.value.has(`complete-rework:${reworkId}`)) return;
    reworkCompletionIntents.get(reworkId)?.intent.reset();
    reworkCompletionIntents.delete(reworkId);
  };
  const loadSupplementCandidates = (dispositionId: string) =>
    productionApi.listSupplementCandidates(dispositionId);
  const loadScrapSupplementPlan = (dispositionId: string) =>
    productionApi.getScrapSupplementPlan(dispositionId);
  const saveScrapSupplementPlan = (
    disposition: BatchStepAbnormalDispositionItem,
    details: ApproveScrapSupplementLinePayload[],
    remark: string,
    planVersion: number | null,
  ): Promise<ProductionScrapSupplementPlanItem> => {
    requireCurrentBatch(disposition.productionBatchId);
    return productionApi.saveScrapSupplementPlan(disposition.dispositionId, {
      planVersion,
      dispositionVersion: disposition.version,
      details,
      remark: remark.trim() || null,
    });
  };
  const approveScrapSupplement = (
    disposition: BatchStepAbnormalDispositionItem,
    planVersion: number,
  ): Promise<void> =>
    withPending(`approve-scrap:${disposition.dispositionId}`, async () => {
      requireCurrentBatch(disposition.productionBatchId);
      const body = {
        version: planVersion,
        dispositionVersion: disposition.version,
      };
      const intent = supplementIntents.get(disposition.dispositionId) ?? useIdempotentIntent();
      supplementIntents.set(disposition.dispositionId, intent);
      try {
        await intent.execute(
          {
            intentType: 'production.abnormal.scrap-supplement-plan.confirm',
            params: { dispositionId: disposition.dispositionId },
            query: {},
            body,
          },
          (key) => productionApi.confirmScrapSupplementPlan(disposition.dispositionId, body, key),
        );
      } catch (error) {
        if (isAmbiguousFailure(error)) {
          try {
            const plan = await productionApi.getScrapSupplementPlan(disposition.dispositionId);
            if (plan?.status === 'confirmed') {
              supplementIntents.delete(disposition.dispositionId);
              await refreshSelectedBatch(disposition.productionBatchId);
              return;
            }
          } catch {
            // 查询也失败时保留原始模糊失败和幂等键，供用户稍后安全重试。
          }
        }
        throw error;
      }
      supplementIntents.delete(disposition.dispositionId);
      await refreshSelectedBatch(disposition.productionBatchId);
    });
  const getSupplementIntentStatus = (dispositionId: string) =>
    supplementIntents.get(dispositionId)?.getStatus() ?? 'idle';
  const resetSupplementIntent = (dispositionId: string): void => {
    supplementIntents.get(dispositionId)?.reset();
    supplementIntents.delete(dispositionId);
  };
  return {
    batches,
    total,
    pageSize,
    loading,
    listErrorText,
    detailLoading,
    selectedBatchId,
    record,
    completionCheck,
    reworks,
    pendingKeys,
    loadBatches,
    selectBatch,
    completeExecution,
    approveRework,
    rejectDisposition,
    startRework,
    completeRework,
    getReworkCompletionIntentStatus,
    getReworkCompletionRequest,
    getReworkCompletionRequests,
    resetReworkCompletionIntent,
    loadSupplementCandidates,
    loadScrapSupplementPlan,
    saveScrapSupplementPlan,
    approveScrapSupplement,
    getSupplementIntentStatus,
    resetSupplementIntent,
  };
};
