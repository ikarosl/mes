import { onActivated, onDeactivated, onMounted, onScopeDispose } from 'vue';
import { EMessage } from '../../utils/message';

/** 首访立即加载；返回缓存页短暂停留后刷新，快速离开不启动后台读取。 */
export function usePageActivationRefresh(refresh: () => Promise<void>): void {
  let activated = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const run = () => {
    timer = undefined;
    void refresh().catch((error: unknown) => EMessage.error(error));
  };
  onMounted(run);
  onActivated(() => {
    // KeepAlive 首次挂载也会激活，首次读取已由 onMounted 发起。
    if (!activated) {
      activated = true;
      return;
    }
    cancel();
    timer = setTimeout(run, 150);
  });
  onDeactivated(cancel);
  onScopeDispose(cancel);
}
