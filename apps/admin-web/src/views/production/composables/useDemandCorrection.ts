import {
  computed,
  onActivated,
  onDeactivated,
  onScopeDispose,
  ref,
  shallowRef,
  watch,
  type ComputedRef,
  type Ref,
  type WritableComputedRef,
} from 'vue';
import { useRoute } from 'vue-router';
import type {
  DemandCorrectionCheck,
  DemandCorrectionKind,
  SubmitDemandCorrectionPayload,
} from '@company/contracts';
import { productionApi } from '../../../api/production';
import {
  useIdempotentIntent,
  type IdempotentIntentStatus,
} from '../../../composables/idempotency/useIdempotentIntent';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { useAuthStore } from '../../../stores/auth';
import { useTabsStore } from '../../../stores/tabs';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';

interface CorrectionCommand {
  demandId: string;
  body: SubmitDemandCorrectionPayload;
}

interface DemandCorrectionEditor {
  check: Ref<DemandCorrectionCheck | null>;
  demandId: Ref<string | null>;
  loading: Ref<boolean>;
  ready: Ref<boolean>;
  submitting: Ref<boolean>;
  confirming: Ref<boolean>;
  unresolved: ComputedRef<boolean>;
  unresolvedMessage: ComputedRef<string>;
  error: Ref<string>;
  writeError: Ref<string>;
  kind: Ref<DemandCorrectionKind>;
  kinds: ComputedRef<DemandCorrectionKind[]>;
  target: WritableComputedRef<string>;
  reason: Ref<string>;
  remaining: ComputedRef<number | undefined>;
  quantityError: ComputedRef<string>;
  dirty: ComputedRef<boolean>;
  basisChanged: ComputedRef<boolean>;
  targetChanged: ComputedRef<boolean>;
  canAdoptBasis: ComputedRef<boolean>;
  canSubmit: ComputedRef<boolean>;
  load(): Promise<boolean>;
  adoptCurrentBasis(): Promise<void>;
  submit(): Promise<void>;
  close(done?: () => void): Promise<boolean>;
}

/** 当前需求的命令草稿与最新核对结果分开，刷新不替换提交版本或令牌。 */
export function useDemandCorrection(
  props: { visible: boolean; demandId: string | null },
  changed: () => void,
  closed: () => void,
): DemandCorrectionEditor {
  const check = shallowRef<DemandCorrectionCheck | null>(null);
  const basis = shallowRef<DemandCorrectionCheck | null>(null);
  const demandId = ref<string | null>(null);
  const loading = ref(false);
  const ready = ref(false);
  const active = ref(true);
  const submitting = ref(false);
  const confirming = ref(false);
  const intentStatus = ref<IdempotentIntentStatus>('idle');
  const error = ref('');
  const writeError = ref('');
  const needsRecheck = ref(false);
  const kind = ref<DemandCorrectionKind>('quantity');
  const quantityDraft = ref('');
  const reason = ref('');
  const reads = useLatestReadRequest(() => (loading.value = false));
  const intent = useIdempotentIntent('需求更正申请');
  const auth = useAuthStore();
  let pending: CorrectionCommand | null = null;
  let initialTarget = '';
  let sessionEpoch = 0;
  let editorEpoch = 0;
  let closing: Promise<boolean> | null = null;

  const target = computed({
    get: () =>
      kind.value === 'close' ? String(basis.value?.issuedQuantity ?? '') : quantityDraft.value,
    set: (value: string) => {
      if (kind.value === 'quantity') quantityDraft.value = value;
    },
  });
  const targetQuantity = computed<number | undefined>(() => {
    const text = target.value.trim();
    if (!/^\d+$/.test(text)) return undefined;
    const value = Number(text);
    return Number.isSafeInteger(value) && value <= 99_999_999 ? value : undefined;
  });
  const remaining = computed(() =>
    check.value && targetQuantity.value !== undefined
      ? targetQuantity.value - Number(check.value.issuedQuantity)
      : undefined,
  );
  const kinds = computed<DemandCorrectionKind[]>(() =>
    basis.value?.demandType === 'manual_additional' ? ['quantity', 'close'] : ['quantity'],
  );
  const unresolved = computed(() => intentStatus.value !== 'idle');
  const unresolvedMessage = computed(() => {
    if (intentStatus.value === 'blocked')
      return '提交结果无法读取，原请求和标识已保留。请先在需求追溯中核对审批结果，再决定是否放弃本地记录。';
    if (intentStatus.value === 'expired')
      return '原提交已超出安全重试窗口，原请求和标识已保留。请先在需求追溯中核对审批结果，再决定是否放弃本地记录。';
    return '提交结果未确认，输入、原请求和提交标识已保留。请重试原提交，或先在需求追溯中核对审批结果。';
  });
  const dirty = computed(
    () =>
      !!basis.value &&
      (kind.value !== 'quantity' || quantityDraft.value !== initialTarget || reason.value !== ''),
  );
  const targetChanged = computed(() => !!demandId.value && props.demandId !== demandId.value);
  const basisChanged = computed(
    () =>
      !!basis.value &&
      (needsRecheck.value ||
        (!!check.value &&
          (check.value.version !== basis.value.version ||
            check.value.checkToken !== basis.value.checkToken))),
  );
  const quantityError = computed(() => {
    if (!target.value.trim()) return '请填写更正后目标总量';
    if (targetQuantity.value === undefined) return '请输入 0 至 99999999 的整数';
    if (remaining.value !== undefined && remaining.value < 0)
      return `目标总量不能少于历次累计已领 ${check.value?.issuedQuantity} ${check.value?.unit}`;
    if (
      kind.value === 'quantity' &&
      targetQuantity.value === Number(check.value?.currentTotalQuantity)
    )
      return '更正后目标总量与当前目标相同，请填写需要调整的总量';
    return '';
  });
  const canUseCheck = computed(
    () =>
      props.visible &&
      active.value &&
      ready.value &&
      !targetChanged.value &&
      !loading.value &&
      !error.value &&
      !submitting.value &&
      !confirming.value &&
      check.value?.demandId === demandId.value,
  );
  const canAdoptBasis = computed(
    () =>
      !!canUseCheck.value && !!check.value?.canCorrect && !unresolved.value && basisChanged.value,
  );
  const canSubmit = computed(() => {
    if (
      !props.visible ||
      !active.value ||
      targetChanged.value ||
      submitting.value ||
      confirming.value
    )
      return false;
    if (unresolved.value) return !!pending && intent.getStatus() === 'pending';
    return !!(
      canUseCheck.value &&
      check.value?.canCorrect &&
      basis.value &&
      !basisChanged.value &&
      kinds.value.includes(kind.value) &&
      !quantityError.value &&
      reason.value.trim().length > 0 &&
      reason.value.trim().length <= 5000
    );
  });

  async function load(): Promise<boolean> {
    const id = demandId.value;
    if (
      !id ||
      !props.visible ||
      props.demandId !== id ||
      !reads.isActive() ||
      submitting.value ||
      confirming.value ||
      unresolved.value
    )
      return false;
    const { isCurrent, signal } = reads.begin(
      () => props.visible && props.demandId === id && demandId.value === id,
    );
    loading.value = true;
    ready.value = false;
    error.value = '';
    try {
      const preview = await productionApi.getDemandCorrectionCheck(id, {
        signal,
        skipErrorHandling: true,
      });
      if (!isCurrent()) return false;
      if (!preview || preview.demandId !== id)
        throw new Error('需求核对结果与当前需求不一致，请重试');
      check.value = preview;
      ready.value = true;
      if (!basis.value) {
        basis.value = preview;
        quantityDraft.value = String(preview.currentTotalQuantity);
        initialTarget = quantityDraft.value;
      }
      return true;
    } catch (failure) {
      if (isCurrent())
        error.value = failure instanceof Error ? failure.message : '需求核对失败，请重试';
      return false;
    } finally {
      if (isCurrent()) loading.value = false;
    }
  }

  async function adoptCurrentBasis(): Promise<void> {
    const preview = check.value;
    const epoch = editorEpoch;
    if (!preview || !canAdoptBasis.value) return;
    confirming.value = true;
    try {
      await RouteMessageBox.confirm(
        `需求 id:${preview.demandId} · ${preview.itemCode} / ${preview.materialVariantCode}\n当前目标总量 ${preview.currentTotalQuantity}，历次累计已领 ${preview.issuedQuantity} ${preview.unit}。\n采用当前依据后保留填写的目标总量和原因；关闭剩余将按最新已领量核对。请再次检查本次新需求量及相关影响，再明确提交。`,
        '采用当前核对依据',
        {
          type: 'warning',
          confirmButtonText: '已核对，采用当前依据',
          cancelButtonText: '保留原依据',
        },
      );
      if (
        epoch !== editorEpoch ||
        !active.value ||
        !props.visible ||
        props.demandId !== preview.demandId ||
        check.value !== preview ||
        !ready.value ||
        !preview.canCorrect ||
        unresolved.value
      )
        return;
      basis.value = preview;
      initialTarget = String(preview.currentTotalQuantity);
      needsRecheck.value = false;
      writeError.value = '';
    } catch {
      // 取消确认或离开路由时，保留原提交依据与全部草稿。
    } finally {
      if (epoch === editorEpoch) confirming.value = false;
    }
  }

  function clearEditor(): void {
    editorEpoch += 1;
    reads.invalidate();
    intent.reset();
    pending = null;
    intentStatus.value = 'idle';
    check.value = null;
    basis.value = null;
    demandId.value = null;
    ready.value = false;
    needsRecheck.value = false;
    error.value = '';
    writeError.value = '';
    kind.value = 'quantity';
    quantityDraft.value = '';
    initialTarget = '';
    reason.value = '';
  }

  async function submit(): Promise<void> {
    if (!canSubmit.value) return;
    let command = pending;
    if (!command) {
      const reviewed = basis.value;
      const total = targetQuantity.value;
      if (!reviewed || total === undefined || reviewed.demandId !== demandId.value) return;
      command = {
        demandId: reviewed.demandId,
        body: {
          version: reviewed.version,
          checkToken: reviewed.checkToken,
          kind: kind.value,
          targetTotalQuantity: total,
          reason: reason.value.trim(),
        },
      };
    }
    const currentCommand = command;
    const epoch = sessionEpoch;
    pending = currentCommand;
    reads.invalidate();
    submitting.value = true;
    writeError.value = '';
    try {
      await intent.execute(
        {
          intentType: 'production.demand.correct',
          params: { demandId: currentCommand.demandId },
          query: {},
          body: currentCommand.body,
        },
        (key) =>
          productionApi.submitDemandCorrection(currentCommand.demandId, currentCommand.body, key),
      );
      if (epoch !== sessionEpoch) return;
      const stillSelected = props.visible && props.demandId === currentCommand.demandId;
      clearEditor();
      if (stillSelected) {
        EMessage.success('已提交需求更正审批');
        changed();
        closed();
      }
    } catch (failure) {
      if (epoch !== sessionEpoch) return;
      intentStatus.value = intent.getStatus();
      if (!unresolved.value) {
        pending = null;
        needsRecheck.value = true;
        ready.value = false;
      }
      writeError.value = failure instanceof Error ? failure.message : '需求更正提交失败，请重试';
    } finally {
      if (epoch === sessionEpoch) submitting.value = false;
    }
  }

  async function close(done?: () => void): Promise<boolean> {
    if (submitting.value) return false;
    if (closing) return closing;
    if (confirming.value) return false;
    if (!demandId.value) {
      if (props.visible) {
        closed();
        done?.();
      }
      return true;
    }
    const epoch = editorEpoch;
    closing = (async () => {
      confirming.value = true;
      try {
        if (unresolved.value || dirty.value) {
          try {
            await RouteMessageBox.confirm(
              unresolved.value
                ? '提交结果未确认。关闭将放弃原请求和本地重试标识；请先在需求追溯中核对审批结果，确认关闭？'
                : '更正内容尚未提交，确认放弃输入并关闭？',
              '关闭需求更正',
              { type: 'warning', confirmButtonText: '放弃并关闭', cancelButtonText: '继续保留' },
            );
          } catch {
            // 取消确认或切换路由时，继续保留草稿与原提交标识。
            return false;
          }
        }
        if (epoch !== editorEpoch || submitting.value) return false;
        clearEditor();
        closed();
        done?.();
        return true;
      } finally {
        confirming.value = false;
      }
    })();
    try {
      return await closing;
    } finally {
      closing = null;
    }
  }

  watch(
    () => [props.visible, props.demandId] as const,
    ([visible, id]) => {
      reads.invalidate();
      if (!visible || !id) return;
      // 宿主先 await close() 再换对象；意外换 ID 不能清除旧草稿或未知请求。
      if (demandId.value && demandId.value !== id) return;
      demandId.value = id;
      void load();
    },
    { immediate: true },
  );
  onActivated(() => {
    active.value = true;
  });
  onDeactivated(() => {
    active.value = false;
  });
  watch(
    () => auth.session?.user.id,
    () => {
      sessionEpoch += 1;
      clearEditor();
      submitting.value = false;
      confirming.value = false;
      closed();
    },
  );
  onScopeDispose(useTabsStore().registerCloseGuard(String(useRoute().name), () => close()));

  return {
    check,
    demandId,
    loading,
    ready,
    submitting,
    confirming,
    unresolved,
    unresolvedMessage,
    error,
    writeError,
    kind,
    kinds,
    target,
    reason,
    remaining,
    quantityError,
    dirty,
    basisChanged,
    targetChanged,
    canAdoptBasis,
    canSubmit,
    load,
    adoptCurrentBasis,
    submit,
    close,
  };
}
