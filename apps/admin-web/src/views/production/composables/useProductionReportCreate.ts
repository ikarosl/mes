import { computed, reactive, ref } from 'vue';
import type { BatchStepAbnormalOrigin } from '@company/contracts';
import { PRODUCTION_REPORT_QUANTITY_MAX } from '@company/constants';
import { productionApi } from '../../../api/production';
import {
  useIdempotentIntent,
  type IdempotentIntentStatus,
} from '../../../composables/idempotency/useIdempotentIntent';
import { EMessage } from '../../../utils/message';
import type { ProductionReportContext } from '../production-report-selection';
import { canOpenProductionReport } from '../production-report-input';

export interface ProductionReportInput {
  normalQuantity: number;
  abnormalQuantity: number;
  abnormalOrigin: BatchStepAbnormalOrigin | null;
  remark: string | null;
}

export const useProductionReportCreate = (options: {
  getContext: (stepRecordId: string, historical: boolean) => ProductionReportContext | null;
  isReady: () => boolean;
  refresh: () => Promise<void>;
}) => {
  const visible = ref(false),
    historical = ref(false),
    submitting = ref(false);
  const task = ref<ProductionReportContext | null>(null);
  const mode = ref<'normal' | 'abnormal'>('normal');
  const intent = useIdempotentIntent('报工');
  const intentStatus = ref<IdempotentIntentStatus>('idle');
  const contextReady = computed(() => {
    if (!options.isReady() || !task.value) return false;
    const latest = options.getContext(task.value.stepRecordId, historical.value);
    return (
      latest?.version === task.value.version &&
      canOpenProductionReport(latest, historical.value) &&
      latest.upperLimitQuantity === task.value.upperLimitQuantity &&
      latest.availableReportQuantity === task.value.availableReportQuantity
    );
  });
  const open = (
    context: ProductionReportContext,
    nextMode: 'normal' | 'abnormal',
    isHistorical = false,
  ): void => {
    if (
      visible.value ||
      submitting.value ||
      !options.isReady() ||
      !canOpenProductionReport(context, isHistorical)
    )
      return;
    task.value = { ...context };
    mode.value = nextMode;
    historical.value = isHistorical;
    intentStatus.value = 'idle';
    intent.reset();
    visible.value = true;
  };
  const resetIntent = (): void => {
    intent.reset();
    intentStatus.value = 'idle';
  };
  const submit = async (input: ProductionReportInput): Promise<void> => {
    if (
      !task.value ||
      submitting.value ||
      (intentStatus.value !== 'pending' && !contextReady.value)
    )
      return;
    const target = task.value;
    const quantity = input.normalQuantity + input.abnormalQuantity;
    const available = Number(target.availableReportQuantity);
    if (
      !Number.isSafeInteger(input.normalQuantity) ||
      !Number.isSafeInteger(input.abnormalQuantity) ||
      input.normalQuantity < 0 ||
      input.abnormalQuantity < 0 ||
      !Number.isFinite(available) ||
      quantity <= 0 ||
      quantity > PRODUCTION_REPORT_QUANTITY_MAX ||
      quantity > available
    )
      return;
    const body = {
      version: target.version,
      normalQuantity: input.normalQuantity,
      abnormalQuantity: historical.value ? 0 : input.abnormalQuantity,
      abnormalOrigin: !historical.value && input.abnormalQuantity > 0 ? input.abnormalOrigin : null,
      remark: input.remark?.trim() || null,
    };
    const historicalBody = {
      version: target.version,
      normalQuantity: input.normalQuantity,
      reason: input.remark?.trim() || '',
    };
    submitting.value = true;
    try {
      await intent.execute(
        {
          intentType: historical.value
            ? 'production.historical-step-report.create'
            : 'production.step-report.create',
          params: { batchId: target.productionBatchId, stepRecordId: target.stepRecordId },
          query: {},
          body: historical.value ? historicalBody : body,
        },
        (key) =>
          historical.value
            ? productionApi.createHistoricalStepReport(
                target.productionBatchId,
                target.stepRecordId,
                historicalBody,
                key,
              )
            : productionApi.createStepReport(
                target.productionBatchId,
                target.stepRecordId,
                body,
                key,
              ),
      );
      visible.value = false;
      EMessage.success(
        historical.value
          ? '普通正常报工历史补录已记录'
          : mode.value === 'normal'
            ? '正常报工已记录'
            : '异常报工已记录，待按业务规则处置',
      );
      await options.refresh();
    } catch (error) {
      EMessage.error(error, '报工未完成，请核对工序资格和统一上限');
    } finally {
      intentStatus.value = intent.getStatus();
      submitting.value = false;
    }
  };
  return reactive({
    visible,
    historical,
    task,
    mode,
    submitting,
    intentStatus,
    contextReady,
    open,
    resetIntent,
    submit,
  });
};
