import { computed, reactive, ref, watch } from 'vue';
import type {
  BatchCloseoutDetail,
  BatchTerminationMaterial,
  RecordCloseoutMaterialLossPayload,
} from '@company/contracts';
import { productionApi } from '../../../api/production';
import { useIdempotentIntent } from '../../../composables/idempotency/useIdempotentIntent';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';

export function useCloseoutMaterialLoss(
  props: {
    visible: boolean;
    batchId: string | null;
    material: BatchTerminationMaterial | null;
    detail: BatchCloseoutDetail | null;
    disabled: boolean;
  },
  recorded: () => void,
  closed: () => void,
) {
  const source = ref<BatchTerminationMaterial | null>(null);
  const basis = ref<{ batchId: string; version: number; checkToken: string } | null>(null);
  const form = reactive<{ scrapQuantity: number | undefined; reason: string }>({
    scrapQuantity: 1,
    reason: '',
  });
  const submitting = ref(false),
    confirming = ref(false),
    unresolved = ref(false);
  const intent = useIdempotentIntent();
  let pending: { batchId: string; body: RecordCloseoutMaterialLossPayload } | null = null;
  const maximum = computed(() => Number(source.value?.returnableQuantity ?? 0));
  const dirty = computed(() => !!form.reason || form.scrapQuantity !== 1);
  const stale = computed(
    () =>
      !basis.value ||
      basis.value.batchId !== props.batchId ||
      basis.value.version !== props.detail?.version ||
      basis.value.checkToken !== props.detail?.check.checkToken ||
      source.value?.allocationId !== props.material?.allocationId,
  );
  const eligible = computed(
    () =>
      props.detail?.canHandle &&
      props.detail.check.batchStatus === 'closing' &&
      !props.detail.pendingApprovalId &&
      !props.detail.currentRevisionId &&
      maximum.value > 0,
  );
  const locked = computed(
    () =>
      props.disabled ||
      submitting.value ||
      confirming.value ||
      unresolved.value ||
      stale.value ||
      !eligible.value,
  );
  const quantityValid = computed(
    () =>
      Number.isSafeInteger(form.scrapQuantity) &&
      Number(form.scrapQuantity) > 0 &&
      Number(form.scrapQuantity) <= maximum.value,
  );
  const canSubmit = computed(
    () =>
      !locked.value &&
      quantityValid.value &&
      !!form.reason.trim() &&
      form.reason.trim().length <= 5000,
  );
  const remaining = computed(() =>
    quantityValid.value ? maximum.value - Number(form.scrapQuantity) : maximum.value,
  );

  async function run() {
    if (submitting.value || !pending) return;
    const command = pending;
    submitting.value = true;
    try {
      await intent.execute(
        {
          intentType: 'production.closeout.material-loss',
          params: { batchId: command.batchId },
          query: {},
          body: command.body,
        },
        (key) => productionApi.recordCloseoutMaterialLoss(command.batchId, command.body, key),
      );
      pending = null;
      unresolved.value = false;
      if (
        props.visible &&
        props.batchId === command.batchId &&
        source.value?.allocationId === command.body.allocationId
      ) {
        EMessage.success('损坏已登记，可退上限已扣减；请重新核对本项物料安排');
        recorded();
        closed();
      }
    } catch (failure) {
      unresolved.value = intent.getStatus() !== 'idle';
      if (!unresolved.value) pending = null;
      EMessage.error(failure, '损坏登记失败，请刷新核对后重试');
    } finally {
      submitting.value = false;
    }
  }
  async function submit() {
    if (!canSubmit.value || !basis.value || !source.value) return;
    const reviewed = { ...basis.value };
    const body: RecordCloseoutMaterialLossPayload = {
      version: reviewed.version,
      checkToken: reviewed.checkToken,
      allocationId: source.value.allocationId,
      scrapQuantity: Number(form.scrapQuantity),
      reason: form.reason.trim(),
    };
    confirming.value = true;
    try {
      await RouteMessageBox.confirm(
        `确认登记 ${source.value.itemCode} 损坏 ${body.scrapQuantity} ${source.value.unit}？可退上限将由 ${maximum.value} 减为 ${remaining.value}。本次登记立即生效，不补料、不补产，不产生库存流水；结案审批驳回也不会撤销损坏事实。`,
        '确认结案损坏登记',
        { type: 'warning', confirmButtonText: '确认登记损坏' },
      );
      if (
        !props.visible ||
        props.batchId !== reviewed.batchId ||
        stale.value ||
        !eligible.value ||
        props.disabled
      ) {
        EMessage.warning('核对依据已变化，请返回列表刷新后重新登记');
        return;
      }
      pending = { batchId: reviewed.batchId, body };
      await run();
    } catch (failure) {
      if (failure !== 'cancel' && failure !== 'close') EMessage.error(failure);
    } finally {
      confirming.value = false;
    }
  }
  async function close(): Promise<boolean> {
    if (submitting.value || confirming.value) return false;
    if (unresolved.value || dirty.value) {
      try {
        await RouteMessageBox.confirm(
          unresolved.value
            ? '登记结果尚未确认，请先核对损耗记录。关闭将放弃本地重试标识，确认继续？'
            : '存在未保存的损坏登记，确认放弃输入？',
          '关闭损坏登记',
          { type: 'warning' },
        );
      } catch {
        return false;
      }
    }
    intent.reset();
    pending = null;
    unresolved.value = false;
    closed();
    return true;
  }
  watch(
    () => [props.visible, props.batchId, props.material?.allocationId] as const,
    ([visible]) => {
      if (!visible) return;
      source.value = props.material ? { ...props.material } : null;
      basis.value =
        props.detail && props.batchId
          ? {
              batchId: props.batchId,
              version: props.detail.version,
              checkToken: props.detail.check.checkToken,
            }
          : null;
      Object.assign(form, { scrapQuantity: 1, reason: '' });
    },
    { immediate: true },
  );
  return {
    source,
    form,
    maximum,
    remaining,
    submitting,
    confirming,
    unresolved,
    stale,
    locked,
    canSubmit,
    submit,
    close,
    retry: run,
  };
}
