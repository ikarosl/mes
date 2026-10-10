import { computed, reactive, ref } from 'vue';
import type {
  BatchStepExecutionRecordItem,
  BatchStepReportView,
  CorrectBatchStepReportPayload,
  ProductionBatchStatus,
  ProductionWorkerTaskItem,
} from '@company/contracts';
import { PRODUCTION_REPORT_QUANTITY_MAX } from '@company/constants';
import { RequestError } from '@company/request';
import { productionApi } from '../../../api/production';
import {
  isAmbiguousFailure,
  useIdempotentIntent,
  type IdempotentIntentStatus,
} from '../../../composables/idempotency/useIdempotentIntent';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';
import { validateProductionReportCorrectionQuantity } from '../production-report-input';

type ReportStep = BatchStepExecutionRecordItem | ProductionWorkerTaskItem;

interface ReportAdjustmentOptions {
  getStep: (stepRecordId: string) => ReportStep | null;
  getBatchStatus: () => ProductionBatchStatus | null;
  isReady: () => boolean;
  refresh: () => Promise<void>;
}

interface ReportCorrectionRequest {
  productionBatchId: string;
  stepRecordId: string;
  reportId: string;
  historical: boolean;
  body: CorrectBatchStepReportPayload;
}

export const useProductionReportAdjustment = (options: ReportAdjustmentOptions) => {
  const visible = ref(false);
  const mode = ref<'correct' | 'reverse'>('correct');
  const step = ref<ReportStep | null>(null);
  const report = ref<BatchStepReportView | null>(null);
  const historical = ref(false);
  const submitting = ref(false);
  const unknownReverse = ref(false);
  const quantityTouched = ref(false);
  const intent = useIdempotentIntent('报工更正');
  const intentStatus = ref<IdempotentIntentStatus>('idle');
  let correctionRequest: ReportCorrectionRequest | null = null;
  const form = reactive({ normalQuantity: '', reason: '' });
  const inputsLocked = computed(
    () => submitting.value || intentStatus.value !== 'idle' || unknownReverse.value,
  );
  const setNormalQuantity = (value: string): void => {
    if (inputsLocked.value) return;
    form.normalQuantity = value;
    quantityTouched.value = true;
  };
  const touchQuantity = (): void => {
    quantityTouched.value = true;
  };
  const setReason = (value: string): void => {
    if (!inputsLocked.value) form.reason = value;
  };
  const latest = computed(() => (step.value ? options.getStep(step.value.stepRecordId) : null));
  const stale = computed(
    () =>
      !options.isReady() ||
      !latest.value ||
      latest.value.productionBatchId !== step.value?.productionBatchId ||
      (historical.value
        ? !('canCreateHistoricalReport' in latest.value) || !latest.value.canCreateHistoricalReport
        : !latest.value.canCorrectReport) ||
      latest.value.version !== step.value?.version ||
      latest.value.upperLimitQuantity !== step.value?.upperLimitQuantity ||
      latest.value.availableReportQuantity !== step.value?.availableReportQuantity ||
      latest.value.effectiveDirectReportedQuantity !==
        step.value?.effectiveDirectReportedQuantity ||
      (options.getBatchStatus() !== 'doing') !== historical.value,
  );
  const maximumQuantity = computed(() => {
    if (!step.value || !report.value) return 0;
    return Math.max(
      0,
      Math.min(
        Number(step.value.availableReportQuantity) + Number(report.value.reportedQuantity),
        Number(step.value.upperLimitQuantity) -
          Number(step.value.effectiveDirectReportedQuantity) +
          Number(report.value.reportedQuantity),
        PRODUCTION_REPORT_QUANTITY_MAX,
      ),
    );
  });
  const quantityValidation = computed(() =>
    validateProductionReportCorrectionQuantity(form.normalQuantity, maximumQuantity.value),
  );
  const replacementQuantity = computed(() =>
    mode.value === 'reverse' ? 0 : quantityValidation.value.quantity,
  );
  const afterNormalQuantity = computed(() => {
    if (!step.value || !report.value || replacementQuantity.value === null) return null;
    return (
      Number(step.value.effectiveNormalQuantity) -
      Number(report.value.normalQuantity) +
      replacementQuantity.value
    );
  });
  const afterAvailableQuantity = computed(() => {
    if (!step.value || !report.value || replacementQuantity.value === null) return null;
    return (
      Number(step.value.upperLimitQuantity) -
      Number(step.value.effectiveDirectReportedQuantity) +
      Number(report.value.reportedQuantity) -
      replacementQuantity.value
    );
  });
  const isNormalReport = computed(
    () =>
      report.value?.sourceKind === 'direct_normal' && Number(report.value.abnormalQuantity) === 0,
  );
  const canSubmit = computed(() => {
    if (submitting.value || unknownReverse.value || !step.value || !report.value) return false;
    if (intentStatus.value === 'blocked' || intentStatus.value === 'expired') return false;
    // 未确认的更正仅重放首次请求，最新状态变化不能把它转成新的写入意图。
    if (mode.value === 'correct' && intentStatus.value === 'pending')
      return correctionRequest !== null;
    if (stale.value || !isNormalReport.value || !form.reason.trim()) return false;
    if (mode.value === 'reverse') return report.value.canReverse;
    return report.value.canCorrect && quantityValidation.value.error === null;
  });
  const canSwitchToReverse = computed(
    () =>
      mode.value === 'correct' &&
      !inputsLocked.value &&
      !stale.value &&
      isNormalReport.value &&
      Boolean(report.value?.canReverse) &&
      quantityValidation.value.quantity === 0,
  );
  const switchToReverse = (): void => {
    if (canSwitchToReverse.value) mode.value = 'reverse';
  };
  const open = (
    nextMode: 'correct' | 'reverse',
    nextStep: ReportStep,
    nextReport: BatchStepReportView,
  ): void => {
    if (
      submitting.value ||
      visible.value ||
      !options.isReady() ||
      nextReport.productionBatchId !== nextStep.productionBatchId ||
      nextReport.stepRecordId !== nextStep.stepRecordId ||
      nextReport.sourceKind !== 'direct_normal' ||
      Number(nextReport.abnormalQuantity) !== 0 ||
      !(nextMode === 'correct' ? nextReport.canCorrect : nextReport.canReverse)
    )
      return;
    mode.value = nextMode;
    step.value = { ...nextStep };
    report.value = { ...nextReport };
    historical.value = options.getBatchStatus() !== 'doing';
    form.normalQuantity = nextReport.normalQuantity;
    form.reason = '';
    quantityTouched.value = false;
    unknownReverse.value = false;
    correctionRequest = null;
    intent.reset();
    intentStatus.value = 'idle';
    visible.value = true;
  };
  const discard = async (): Promise<boolean> => {
    if (!visible.value) return true;
    if (submitting.value) return false;
    const dirty =
      form.reason.length > 0 ||
      (mode.value === 'correct' && form.normalQuantity !== report.value?.normalQuantity);
    if (intentStatus.value === 'idle' && !unknownReverse.value && !dirty) return true;
    try {
      await RouteMessageBox.confirm(
        intentStatus.value !== 'idle' || unknownReverse.value
          ? '本次调整结果尚未确认。请先核对报工历史；放弃原请求的安全重试后重新办理，可能重复更正。'
          : '本次数量或原因尚未提交，确认放弃？',
        '关闭报工调整',
        { type: 'warning', confirmButtonText: '确认放弃', cancelButtonText: '继续保留' },
      );
      intent.reset();
      intentStatus.value = 'idle';
      correctionRequest = null;
      unknownReverse.value = false;
      return true;
    } catch {
      return false;
    }
  };
  const close = async (): Promise<void> => {
    if (await discard()) visible.value = false;
  };
  const beforeClose = async (done: () => void): Promise<void> => {
    if (await discard()) {
      visible.value = false;
      done();
    }
  };
  const submit = async (): Promise<void> => {
    quantityTouched.value = true;
    if (!canSubmit.value || !step.value || !report.value) return;
    const targetStep = step.value;
    const targetReport = report.value;
    let refreshNeeded: boolean;
    submitting.value = true;
    try {
      if (mode.value === 'reverse') {
        const body = { version: targetStep.version, reason: form.reason.trim() };
        await (
          historical.value
            ? productionApi.reverseHistoricalStepReport
            : productionApi.reverseStepReport
        )(targetStep.productionBatchId, targetStep.stepRecordId, targetReport.reportId, body);
      } else {
        if (!correctionRequest) {
          const validation = validateProductionReportCorrectionQuantity(
            form.normalQuantity,
            maximumQuantity.value,
          );
          if (validation.quantity === null || validation.error !== null) return;
          correctionRequest = {
            productionBatchId: targetStep.productionBatchId,
            stepRecordId: targetStep.stepRecordId,
            reportId: targetReport.reportId,
            historical: historical.value,
            body: {
              version: targetStep.version,
              normalQuantity: validation.quantity,
              reason: form.reason.trim(),
            },
          };
        }
        const request = correctionRequest;
        await intent.execute(
          {
            intentType: request.historical
              ? 'production.historical-step-report.correct'
              : 'production.step-report.correct',
            params: {
              batchId: request.productionBatchId,
              stepRecordId: request.stepRecordId,
              reportId: request.reportId,
            },
            query: {},
            body: request.body,
          },
          async (key) => {
            const result = await (
              request.historical
                ? productionApi.correctHistoricalStepReport
                : productionApi.correctStepReport
            )(request.productionBatchId, request.stepRecordId, request.reportId, request.body, key);
            if (
              result?.productionBatchId !== request.productionBatchId ||
              result.stepRecordId !== request.stepRecordId ||
              result.reversal?.reversalOfReportId !== request.reportId ||
              result.replacement?.correctionOfReportId !== request.reportId ||
              Number(result.replacement.normalQuantity) !== request.body.normalQuantity ||
              Number(result.replacement.abnormalQuantity) !== 0
            )
              // 成功响应不能核对原单和完整替代量时保留首次请求，不能换键再办。
              throw new RequestError('更正结果无法核对，请保留原请求并检查报工历史', 0);
            return result;
          },
        );
      }
      visible.value = false;
      refreshNeeded = true;
      EMessage.success(
        mode.value === 'correct' ? '正常报工已更正，原记录已保留' : '报工已全量冲销',
      );
    } catch (error) {
      if (mode.value === 'reverse' && isAmbiguousFailure(error)) unknownReverse.value = true;
      EMessage.error(error, '报工调整未完成，请核对记录与阻断原因');
      refreshNeeded = !isAmbiguousFailure(error);
    } finally {
      intentStatus.value = intent.getStatus();
      if (intentStatus.value === 'idle') correctionRequest = null;
      submitting.value = false;
    }
    if (refreshNeeded) {
      try {
        await options.refresh();
      } catch (error) {
        EMessage.error(error, '报工记录刷新失败，请重新读取当前任务');
      }
    }
  };
  return reactive({
    visible,
    mode,
    step,
    report,
    historical,
    submitting,
    unknownReverse,
    intentStatus,
    inputsLocked,
    form,
    quantityTouched,
    quantityValidation,
    maximumQuantity,
    setNormalQuantity,
    touchQuantity,
    setReason,
    stale,
    afterNormalQuantity,
    afterAvailableQuantity,
    canSubmit,
    canSwitchToReverse,
    switchToReverse,
    open,
    close,
    beforeClose,
    submit,
    discard,
  });
};

export type ProductionReportAdjustmentEditor = ReturnType<typeof useProductionReportAdjustment>;
