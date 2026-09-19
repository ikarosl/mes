import { computed, onActivated, ref, watch } from 'vue';
import type {
  DemandCorrectionCheck,
  DemandCorrectionHistoryItem,
  DemandCorrectionKind,
  SubmitDemandCorrectionPayload,
} from '@company/contracts';
import { productionApi } from '../../../api/production';
import { useLatestRequest } from '../../../composables/requests/useLatestRequest';
import { useIdempotentIntent } from '../../../composables/idempotency/useIdempotentIntent';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';
export function useDemandCorrection(
  props: { visible: boolean; demandId: string | null },
  changed: () => void,
  closed: () => void,
) {
  const check = ref<DemandCorrectionCheck | null>(null),
    history = ref<DemandCorrectionHistoryItem[]>([]);
  const loading = ref(false),
    submitting = ref(false),
    unresolved = ref(false),
    error = ref('');
  const kind = ref<DemandCorrectionKind>('quantity'),
    target = ref<number | undefined>(),
    reason = ref('');
  const request = useLatestRequest(),
    intent = useIdempotentIntent();
  let pending: { demandId: string; body: SubmitDemandCorrectionPayload } | null = null;
  const remaining = computed(() => (target.value ?? 0) - Number(check.value?.issuedQuantity ?? 0));
  const canSubmit = computed(
    () =>
      !loading.value &&
      !submitting.value &&
      !error.value &&
      check.value?.canCorrect &&
      Number.isSafeInteger(target.value) &&
      remaining.value >= 0 &&
      reason.value.trim().length > 0,
  );
  async function load(initialize = false) {
    const demandId = props.demandId;
    if (!demandId || !props.visible || unresolved.value) return;
    const current = request.begin(() => props.visible && props.demandId === demandId);
    loading.value = true;
    error.value = '';
    try {
      const [preview, items] = await Promise.all([
        productionApi.getDemandCorrectionCheck(demandId),
        productionApi.getDemandCorrectionHistory(demandId),
      ]);
      if (!current()) return;
      check.value = preview;
      history.value = items;
      if (initialize) target.value = Number(preview.currentTotalQuantity);
    } catch (failure) {
      if (current()) {
        check.value = null;
        error.value = failure instanceof Error ? failure.message : '加载失败';
      }
    } finally {
      if (current()) loading.value = false;
    }
  }
  async function submit() {
    if (submitting.value || (!pending && (!canSubmit.value || !check.value || !props.demandId)))
      return;
    const command = pending ?? {
      demandId: props.demandId!,
      body: {
        version: check.value!.version,
        checkToken: check.value!.checkToken,
        kind: kind.value,
        targetTotalQuantity:
          kind.value === 'close' ? Number(check.value!.issuedQuantity) : target.value!,
        reason: reason.value.trim(),
      },
    };
    pending = command;
    submitting.value = true;
    try {
      await intent.execute(
        {
          intentType: 'production.demand.correct',
          params: { demandId: command.demandId },
          query: {},
          body: command.body,
        },
        (key) => productionApi.submitDemandCorrection(command.demandId, command.body, key),
      );
      pending = null;
      unresolved.value = false;
      if (props.demandId === command.demandId) {
        EMessage.success('已提交需求更正审批');
        changed();
        await load();
      }
    } catch (failure) {
      unresolved.value = intent.getStatus() !== 'idle';
      if (!unresolved.value) pending = null;
      EMessage.error(failure);
    } finally {
      submitting.value = false;
    }
  }
  async function close() {
    if (submitting.value) return;
    if (unresolved.value) {
      try {
        await RouteMessageBox.confirm(
          '提交结果未确认。关闭将放弃本地重试标识，请先核对审批记录。',
          '提交结果未确认',
          { type: 'warning' },
        );
      } catch {
        return;
      }
    }
    intent.reset();
    pending = null;
    unresolved.value = false;
    closed();
  }
  watch(
    () => [props.visible, props.demandId] as const,
    ([visible]) => {
      request.invalidate();
      if (!visible) return;
      check.value = null;
      history.value = [];
      reason.value = '';
      kind.value = 'quantity';
      void load(true);
    },
    { immediate: true },
  );
  let activated = false;
  onActivated(() => {
    if (activated && !submitting.value && !unresolved.value) void load();
    activated = true;
  });
  watch(kind, (value) => {
    if (value === 'close' && check.value) target.value = Number(check.value.issuedQuantity);
  });
  return {
    check,
    history,
    loading,
    submitting,
    unresolved,
    error,
    kind,
    target,
    reason,
    remaining,
    canSubmit,
    load,
    submit,
    close,
  };
}
