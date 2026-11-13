import { computed, onScopeDispose, ref, type ComputedRef, type Ref } from 'vue';
import {
  useIdempotentIntent,
  type ClientIntentSnapshot,
  type IdempotentIntentStatus,
} from './useIdempotentIntent';
import { confirmSubmissionClose } from './submission-recovery';
import { EMessage } from '../../utils/message';

export interface IdempotentCommand<TResult> {
  busy: Ref<boolean>;
  status: Ref<IdempotentIntentStatus>;
  locked: ComputedRef<boolean>;
  run: (
    snapshot: ClientIntentSnapshot,
    submit: (key: string) => Promise<TResult>,
    success: string,
  ) => Promise<void>;
  retry: () => Promise<void>;
  canClose: (dirty?: boolean) => Promise<boolean>;
  discard: () => void;
}

/** 编辑器独占一次命令；submit 闭包只引用本次冻结的业务请求，重试不重新校验候选。 */
export function useIdempotentCommand<TResult>(
  onSuccess: (result: TResult) => void | Promise<void>,
  entityLabel: string,
): IdempotentCommand<TResult> {
  const intent = useIdempotentIntent(entityLabel);
  const busy = ref(false);
  const status = ref<IdempotentIntentStatus>('idle');
  const locked = computed(() => busy.value || status.value !== 'idle');
  let disposed = false;
  let pending: {
    snapshot: ClientIntentSnapshot;
    submit: (key: string) => Promise<TResult>;
    success: string;
  } | null = null;
  onScopeDispose(() => {
    disposed = true;
  });

  const retry = async (): Promise<void> => {
    if (busy.value || !pending || disposed) return;
    const command = pending;
    busy.value = true;
    try {
      let result: TResult;
      try {
        result = await intent.execute(command.snapshot, command.submit);
      } catch (error) {
        if (!disposed) EMessage.error(error, `${entityLabel}提交未完成`);
        return;
      }
      if (disposed) return;
      // 服务端已确认成功。后续展示更新失败不恢复写意图，也不进入提交失败分支。
      pending = null;
      status.value = 'idle';
      EMessage.success(command.success);
      try {
        await onSuccess(result);
      } catch (error) {
        if (!disposed) EMessage.error(error, '操作已成功，页面更新失败，请刷新查看');
      }
    } finally {
      if (!disposed) {
        status.value = intent.getStatus();
        busy.value = false;
        if (status.value === 'idle') pending = null;
      }
    }
  };
  const run = async (
    snapshot: ClientIntentSnapshot,
    submit: (key: string) => Promise<TResult>,
    success: string,
  ): Promise<void> => {
    if (locked.value || disposed) return;
    pending = { snapshot, submit, success };
    await retry();
  };
  const canClose = async (dirty = false): Promise<boolean> => {
    if (busy.value) return false;
    status.value = intent.getStatus();
    const confirmed = await confirmSubmissionClose(status.value, { dirty, entityLabel });
    return confirmed && !busy.value;
  };
  const discard = (): void => {
    if (busy.value) return;
    intent.reset();
    pending = null;
    status.value = 'idle';
  };
  return { busy, status, locked, run, retry, canClose, discard };
}
