import { onScopeDispose } from 'vue';
import { useRoute } from 'vue-router';
import { useTabsStore } from '../stores/tabs';
import { RouteMessageBox } from '../utils/route-message-box';

export function useDraftCloseGuard(options: {
  visible: () => boolean;
  busy: () => boolean;
  dirty: () => boolean;
  label: string;
  onClose: () => void;
}) {
  const canClose = async (): Promise<boolean> => {
    if (!options.visible()) return true;
    if (options.busy()) return false;
    if (!options.dirty()) return true;
    try {
      await RouteMessageBox.confirm(
        `关闭后将放弃未保存的${options.label}，确认关闭？`,
        '放弃未保存内容',
        {
          type: 'warning',
          confirmButtonText: '放弃并关闭',
          cancelButtonText: '继续编辑',
        },
      );
      return !options.busy();
    } catch {
      return false;
    }
  };
  const close = async (): Promise<void> => {
    if (await canClose()) options.onClose();
  };
  const beforeClose = (done: () => void): void => {
    void canClose().then((allowed) => {
      if (allowed) done();
    });
  };
  const route = useRoute();
  onScopeDispose(
    useTabsStore().registerCloseGuard(String(route.meta.tabName ?? route.name), canClose),
  );
  return { close, beforeClose, canClose };
}
