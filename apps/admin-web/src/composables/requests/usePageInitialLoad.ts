import { onMounted } from 'vue';
import { EMessage } from '../../utils/message';

/** 页面实例首次挂载时读取；缓存页面返回由用户手动刷新。 */
export function usePageInitialLoad(load: () => Promise<void>): void {
  onMounted(() => {
    void load().catch((error: unknown) => EMessage.error(error));
  });
}
