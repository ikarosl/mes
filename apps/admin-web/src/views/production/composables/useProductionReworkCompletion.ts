import { computed, reactive, ref } from 'vue';
import type {
  BatchStepExecutionRecordItem,
  ProductionExecutionRecordGroup,
  ReworkRecordItem,
  ReworkRecordView,
} from '@company/contracts';
import type { IdempotentIntentStatus } from '../../../composables/idempotency/useIdempotentIntent';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';
import type { ProductionReworkCompletionRequest } from './useProductionExecutionRecords';

interface ReworkCompletionOptions {
  getBatchId: () => string | null;
  getBatch: () => ProductionExecutionRecordGroup | null;
  getRework: (reworkId: string) => ReworkRecordView | null;
  isReady: () => boolean;
  complete: (
    rework: ReworkRecordItem,
    normalQuantity: number,
    abnormalQuantity: number,
    remark: string,
  ) => Promise<void>;
  getIntentStatus: (reworkId: string) => IdempotentIntentStatus;
  getRequest: (reworkId: string) => ProductionReworkCompletionRequest | null;
  getRequests: () => ProductionReworkCompletionRequest[];
  resetIntent: (reworkId: string) => void;
}

export const useProductionReworkCompletion = (options: ReworkCompletionOptions) => {
  const visible = ref(false);
  const submitting = ref(false);
  const selected = ref<ReworkRecordView | null>(null);
  const batchNo = ref('');
  const stepName = ref('');
  const intentStatus = ref<IdempotentIntentStatus>('idle');
  const form = reactive({
    normalQuantity: 0 as number | undefined,
    abnormalQuantity: 0 as number | undefined,
    remark: '',
  });
  const inputsLocked = computed(() => submitting.value || intentStatus.value !== 'idle');
  const setNormalQuantity = (value: number | undefined): void => {
    if (!inputsLocked.value) form.normalQuantity = value;
  };
  const setAbnormalQuantity = (value: number | undefined): void => {
    if (!inputsLocked.value) form.abnormalQuantity = value;
  };
  const setRemark = (value: string): void => {
    if (!inputsLocked.value) form.remark = value;
  };
  const current = computed(() =>
    selected.value ? options.getRework(selected.value.reworkId) : null,
  );
  const stale = computed(() => {
    const batch = options.getBatch();
    return (
      !options.isReady() ||
      !selected.value ||
      !current.value ||
      options.getBatchId() !== selected.value.productionBatchId ||
      batch?.productionBatchId !== selected.value.productionBatchId ||
      batch.batchStatus !== 'doing' ||
      batch.pendingApprovalId !== null ||
      current.value.status !== 'doing' ||
      current.value.version !== selected.value.version ||
      current.value.responsibleUserId !== selected.value.responsibleUserId ||
      current.value.reworkQuantity !== selected.value.reworkQuantity
    );
  });
  const staleReason = computed(() => {
    if (!stale.value) return '';
    const batch = options.getBatch();
    if (!batch || !options.isReady())
      return '当前任务详情尚未就绪，数量和备注已保留；请刷新后重新核对。';
    if (batch.pendingApprovalId !== null)
      return '当前任务正在审批，不能新登记返工完成结果；数量和备注已保留。';
    if (batch.batchStatus !== 'doing')
      return '当前任务已不能新登记返工完成结果；数量和备注已保留。';
    return '返工状态或核对依据已变化，数量和备注已保留；请关闭后重新核对。';
  });
  const quantitiesValid = computed(
    () =>
      selected.value !== null &&
      Number(selected.value.reworkQuantity) > 0 &&
      typeof form.normalQuantity === 'number' &&
      typeof form.abnormalQuantity === 'number' &&
      Number.isInteger(form.normalQuantity) &&
      Number.isInteger(form.abnormalQuantity) &&
      form.normalQuantity >= 0 &&
      form.abnormalQuantity >= 0 &&
      form.normalQuantity + form.abnormalQuantity === Number(selected.value.reworkQuantity),
  );
  const canSubmit = computed(() => {
    if (!selected.value || submitting.value) return false;
    if (intentStatus.value === 'pending')
      return (
        options.getBatchId() === selected.value.productionBatchId &&
        options.getRequest(selected.value.reworkId) !== null
      );
    return intentStatus.value === 'idle' && !stale.value && quantitiesValid.value;
  });
  const open = (rework: ReworkRecordView, step: BatchStepExecutionRecordItem): void => {
    const batch = options.getBatch();
    if (
      visible.value ||
      submitting.value ||
      !options.isReady() ||
      options.getBatchId() !== rework.productionBatchId ||
      batch?.productionBatchId !== rework.productionBatchId ||
      batch.batchStatus !== 'doing' ||
      batch.pendingApprovalId !== null ||
      rework.status !== 'doing' ||
      rework.stepRecordId !== step.stepRecordId
    )
      return;
    const request = options.getRequest(rework.reworkId);
    selected.value = { ...rework, ...(request?.rework ?? {}) };
    batchNo.value = batch.batchNo;
    stepName.value = `${step.stepOrder}. ${step.stepName}`;
    form.normalQuantity = request?.body.normalQuantity ?? Number(rework.reworkQuantity);
    form.abnormalQuantity = request?.body.abnormalQuantity ?? 0;
    form.remark = request?.body.remark ?? '';
    intentStatus.value = options.getIntentStatus(rework.reworkId);
    visible.value = true;
  };
  const discard = async (): Promise<boolean> => {
    if (submitting.value) return false;
    // 关闭非活动标签也核对 writer 保留的意图，不依赖弹窗当前是否可见。
    const requests = options.getRequests();
    const dirty =
      selected.value !== null &&
      (form.normalQuantity !== Number(selected.value.reworkQuantity) ||
        form.abnormalQuantity !== 0 ||
        form.remark.length > 0);
    if (dirty || requests.length > 0) {
      try {
        await RouteMessageBox.confirm(
          requests.length > 0
            ? '返工完成结果尚未确认。请先核对来源与处理过程；放弃原请求的安全重试后重新办理，可能重复提交。'
            : '本次返工数量或备注尚未提交，确认放弃？',
          '关闭返工完成',
          { type: 'warning', confirmButtonText: '确认放弃', cancelButtonText: '继续保留' },
        );
      } catch {
        return false;
      }
    }
    for (const request of requests) options.resetIntent(request.rework.reworkId);
    visible.value = false;
    selected.value = null;
    intentStatus.value = 'idle';
    return true;
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
    if (!selected.value || !canSubmit.value) return;
    const rework = selected.value;
    const request = options.getRequest(rework.reworkId);
    const normalQuantity = request?.body.normalQuantity ?? form.normalQuantity;
    const abnormalQuantity = request?.body.abnormalQuantity ?? form.abnormalQuantity;
    if (normalQuantity === undefined || abnormalQuantity === undefined) return;
    submitting.value = true;
    try {
      await options.complete(
        request?.rework ?? rework,
        normalQuantity,
        abnormalQuantity,
        request?.body.remark ?? form.remark,
      );
      visible.value = false;
      selected.value = null;
      EMessage.success('整笔返工已完成');
    } catch (error) {
      EMessage.error(error, '返工完成未确认，输入已保留，请核对或按原请求重试');
    } finally {
      intentStatus.value = options.getIntentStatus(rework.reworkId);
      submitting.value = false;
    }
  };
  return reactive({
    visible,
    submitting,
    selected,
    batchNo,
    stepName,
    form,
    intentStatus,
    inputsLocked,
    stale,
    staleReason,
    quantitiesValid,
    canSubmit,
    setNormalQuantity,
    setAbnormalQuantity,
    setRemark,
    open,
    discard,
    close,
    beforeClose,
    submit,
  });
};
