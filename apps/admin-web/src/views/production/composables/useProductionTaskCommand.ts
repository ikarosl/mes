import { computed, onActivated, onScopeDispose, ref, shallowRef, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  useIdempotentIntent,
  type IdempotentIntentStatus,
} from '../../../composables/idempotency/useIdempotentIntent';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { useTabsStore } from '../../../stores/tabs';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';

interface TaskCommandOptions<TCheck, TBody, TResult> {
  label: string;
  intentType: string;
  loadCheck: (
    batchId: string,
    options: { skipErrorHandling: boolean; signal: AbortSignal },
  ) => Promise<TCheck>;
  validateCheck: (check: TCheck, batchId: string) => void;
  basisSignature: (check: TCheck) => string;
  eligible: (check: TCheck) => boolean;
  requiresReason: (check: TCheck) => boolean;
  buildBody: (check: TCheck, reason: string) => TBody;
  send: (batchId: string, body: TBody, key: string) => Promise<TResult>;
  validateResult: (result: TResult, batchId: string, body: TBody) => void;
  successMessage: string;
  changed: (batchId: string, result: TResult) => void;
  closed: () => void;
}

/** 任务开工与撤回结束分别持有核对快照、说明和原写意图。刷新不替换提交依据。 */
export function useProductionTaskCommand<TCheck, TBody, TResult>(
  props: { visible: boolean; batchId: string | null },
  options: TaskCommandOptions<TCheck, TBody, TResult>,
) {
  const basis = shallowRef<TCheck | null>(null);
  const latest = shallowRef<TCheck | null>(null);
  const reason = ref('');
  const loading = ref(false);
  const submitting = ref(false);
  const error = ref('');
  const intentStatus = ref<IdempotentIntentStatus>('idle');
  const intent = useIdempotentIntent(options.label);
  const reads = useLatestReadRequest(() => (loading.value = false));
  let pending: { batchId: string; body: TBody } | null = null;
  const unresolved = computed(() => intentStatus.value !== 'idle');
  const stale = computed(
    () =>
      !!basis.value &&
      !!latest.value &&
      options.basisSignature(basis.value) !== options.basisSignature(latest.value),
  );
  const canSubmit = computed(
    () =>
      reads.isActive() &&
      !!basis.value &&
      !loading.value &&
      !submitting.value &&
      !unresolved.value &&
      !error.value &&
      !stale.value &&
      options.eligible(basis.value) &&
      (!options.requiresReason(basis.value) || !!reason.value.trim()),
  );
  const canRetry = computed(
    () => !loading.value && !submitting.value && intentStatus.value === 'pending',
  );
  async function load(initialize = false): Promise<boolean> {
    const batchId = props.batchId;
    if (!props.visible || !batchId || !reads.isActive() || submitting.value) return false;
    const { isCurrent, signal } = reads.begin(() => props.visible && props.batchId === batchId);
    loading.value = true;
    error.value = '';
    try {
      const result = await options.loadCheck(batchId, { skipErrorHandling: true, signal });
      if (!isCurrent()) return false;
      options.validateCheck(result, batchId);
      latest.value = result;
      if (initialize || !basis.value) basis.value = result;
      return true;
    } catch (failure) {
      if (isCurrent())
        error.value = failure instanceof Error ? failure.message : '当前任务资格核对失败';
      return false;
    } finally {
      if (isCurrent()) loading.value = false;
    }
  }
  async function reloadBasis(): Promise<void> {
    if (submitting.value || unresolved.value) return;
    const batchId = props.batchId;
    if (reason.value.trim()) {
      try {
        await RouteMessageBox.confirm(
          '重新加载会放弃当前说明，并按最新任务状态重新核对，确认继续？',
          `重新核对${options.label}`,
          {
            type: 'warning',
            confirmButtonText: '放弃说明并重新核对',
            cancelButtonText: '保留说明',
          },
        );
      } catch {
        return;
      }
    }
    if (!props.visible || props.batchId !== batchId || !reads.isActive()) return;
    if (await load(true)) reason.value = '';
  }
  async function submit(): Promise<void> {
    if (!props.visible || !props.batchId || !reads.isActive() || loading.value || submitting.value)
      return;
    intentStatus.value = intent.getStatus();
    if (pending) {
      if (intentStatus.value !== 'pending' || pending.batchId !== props.batchId) return;
    } else {
      if (!canSubmit.value || !basis.value) return;
      pending = {
        batchId: props.batchId,
        body: options.buildBody(basis.value, reason.value.trim()),
      };
    }
    const command = pending;
    submitting.value = true;
    error.value = '';
    try {
      const result = await intent.execute(
        {
          intentType: options.intentType,
          params: { batchId: command.batchId },
          query: {},
          body: command.body,
        },
        async (key) => {
          const result = await options.send(command.batchId, command.body, key);
          options.validateResult(result, command.batchId, command.body);
          return result;
        },
      );
      pending = null;
      intentStatus.value = 'idle';
      EMessage.success(options.successMessage);
      options.changed(command.batchId, result);
      if (props.batchId === command.batchId) options.closed();
    } catch (failure) {
      intentStatus.value = intent.getStatus();
      if (!unresolved.value) pending = null;
      error.value = failure instanceof Error ? failure.message : '操作未完成，请核对任务状态';
    } finally {
      submitting.value = false;
    }
  }
  async function close(done?: () => void): Promise<boolean> {
    if (!props.visible) return true;
    if (submitting.value) return false;
    if (unresolved.value || reason.value.trim()) {
      try {
        await RouteMessageBox.confirm(
          unresolved.value
            ? '本次操作结果尚未确认。关闭将放弃本地安全重试标识，请先核对任务状态和业务历史；确认关闭？'
            : '当前说明尚未提交，确认放弃并关闭？',
          `关闭${options.label}`,
          { type: 'warning', confirmButtonText: '确认关闭', cancelButtonText: '继续保留' },
        );
      } catch {
        return false;
      }
    }
    reads.invalidate();
    intent.reset();
    intentStatus.value = 'idle';
    pending = null;
    options.closed();
    done?.();
    return true;
  }
  watch(
    () => [props.visible, props.batchId] as const,
    ([visible]) => {
      reads.invalidate();
      if (!visible) return;
      if (pending || intent.getStatus() !== 'idle') return;
      basis.value = null;
      latest.value = null;
      reason.value = '';
      error.value = '';
      void load(true);
    },
    { immediate: true },
  );
  onActivated(() => {
    if (props.visible) void load();
  });
  const route = useRoute();
  onScopeDispose(useTabsStore().registerCloseGuard(String(route.name), () => close()));
  return {
    basis,
    reason,
    loading,
    submitting,
    error,
    unresolved,
    intentStatus,
    stale,
    canSubmit,
    canRetry,
    load,
    reloadBasis,
    submit,
    close,
  };
}
