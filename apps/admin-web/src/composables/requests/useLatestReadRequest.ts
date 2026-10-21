import {
  getCurrentInstance,
  getCurrentScope,
  onActivated,
  onDeactivated,
  onScopeDispose,
} from 'vue';
import { useLatestRequest } from './useLatestRequest';

interface LatestReadRequest {
  begin(matchesTarget?: () => boolean): { isCurrent: () => boolean; signal: AbortSignal };
  invalidate(): void;
  isActive(): boolean;
}

/** 只用于读取：新请求、页面失活和卸载均取消旧读取；写命令不得使用。 */
export function useLatestReadRequest(onCancel: () => void): LatestReadRequest {
  const latest = useLatestRequest();
  let controller: AbortController | undefined;
  let active = true;
  const cancel = (): void => {
    latest.invalidate();
    controller?.abort();
    controller = undefined;
    onCancel();
  };
  const begin = (matchesTarget: () => boolean = () => true) => {
    cancel();
    controller = new AbortController();
    return {
      isCurrent: latest.begin(() => active && matchesTarget()),
      signal: controller.signal,
    };
  };
  const deactivate = () => {
    active = false;
    cancel();
  };
  if (getCurrentInstance()) {
    onActivated(() => {
      active = true;
    });
    onDeactivated(deactivate);
  }
  if (getCurrentScope()) onScopeDispose(deactivate);
  return { begin, invalidate: cancel, isActive: () => active };
}
