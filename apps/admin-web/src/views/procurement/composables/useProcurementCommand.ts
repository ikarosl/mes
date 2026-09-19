import { computed, onScopeDispose, ref } from 'vue';
import type { PurchaseOrderCommandResult } from '@company/contracts';
import {
  useIdempotentIntent,
  type ClientIntentSnapshot,
  type IdempotentIntentStatus,
} from '../../../composables/idempotency/useIdempotentIntent';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';

/** 当前弹窗独占命令及第一次提交内容；读刷新不能替换未知结果的写入依据。 */
export function useProcurementCommand<TResult = PurchaseOrderCommandResult>(
  onSuccess: (result: TResult) => void | Promise<void>,
  entityLabel = '采购单',
) {
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
    if (busy.value || !pending) return;
    busy.value = true;
    try {
      const result = await intent.execute(pending.snapshot, pending.submit);
      if (disposed) return;
      EMessage.success(pending.success);
      pending = null;
      status.value = intent.getStatus();
      await onSuccess(result);
    } catch (error) {
      if (!disposed) EMessage.error(error, '采购操作未完成');
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
    if (locked.value) return;
    pending = { snapshot, submit, success };
    await retry();
  };
  const canClose = async (dirty = false): Promise<boolean> => {
    if (busy.value) return false;
    status.value = intent.getStatus();
    if (dirty || status.value !== 'idle') {
      try {
        await RouteMessageBox.confirm(
          status.value !== 'idle'
            ? '上次操作结果尚未确认。请先核对相关记录；关闭将放弃本次原操作重试，确认关闭吗？'
            : '当前修改尚未保存，确定放弃修改吗？',
          '关闭当前办理',
          { type: 'warning', confirmButtonText: '确认关闭', cancelButtonText: '继续核对' },
        );
      } catch {
        return false;
      }
    }
    intent.reset();
    pending = null;
    status.value = 'idle';
    return true;
  };
  return { busy, status, locked, run, retry, canClose };
}
