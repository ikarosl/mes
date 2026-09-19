import { onScopeDispose, ref, watch } from 'vue';
import type { NotificationItem, NotificationReadFilter } from '@company/contracts';
import { notificationApi } from '../../api/notification';
import { useAuthStore } from '../../stores/auth';
import { EMessage } from '../../utils/message';

/** 顶部入口独占当前会话的列表和角标；不跨页面候选缓存或浏览器标签同步。 */
export function useNotifications() {
  const auth = useAuthStore();
  const items = ref<NotificationItem[]>([]);
  const unreadCount = ref<number | null>(null);
  const total = ref(0);
  const page = ref(1);
  const pageSize = 10;
  const readFilter = ref<NotificationReadFilter>('all');
  const loading = ref(false);
  const failed = ref(false);
  const visible = ref(false);
  const pending = ref(new Set<string>());
  let epoch = 0,
    listToken = 0,
    countToken = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  let disposed = false;
  const active = (generation: number) =>
    !disposed && generation === epoch && Boolean(auth.session?.user.id);

  const loadCount = async (): Promise<void> => {
    if (!auth.session?.user.id || pending.value.size) return;
    const generation = epoch,
      token = ++countToken;
    try {
      const result = await notificationApi.unreadCount();
      if (active(generation) && token === countToken) unreadCount.value = result.count;
    } catch (error) {
      if (active(generation) && token === countToken) EMessage.error(error, '通知未读数刷新失败');
    }
  };
  const loadList = async (): Promise<void> => {
    if (!auth.session?.user.id) return;
    const generation = epoch,
      token = ++listToken;
    loading.value = true;
    failed.value = false;
    try {
      const result = await notificationApi.list({
        page: page.value,
        pageSize,
        read: readFilter.value,
      });
      if (!active(generation) || token !== listToken) return;
      items.value = result.items;
      total.value = result.total;
      if (page.value > 1 && !result.items.length) {
        page.value = Math.max(1, Math.ceil(result.total / pageSize));
        await loadList();
      }
    } catch (error) {
      if (!active(generation) || token !== listToken) return;
      failed.value = true;
      EMessage.error(error, '通知列表加载失败');
    } finally {
      if (active(generation) && token === listToken) loading.value = false;
    }
  };
  const refresh = async (): Promise<void> => {
    await Promise.all([loadList(), loadCount()]);
  };
  const open = () => {
    page.value = 1;
    void refresh();
  };
  const changePage = (value: number) => {
    page.value = value;
    void loadList();
  };
  const changeFilter = () => {
    page.value = 1;
    void loadList();
  };

  const read = async (item: NotificationItem): Promise<boolean> => {
    if (pending.value.has(item.id) || !auth.session?.user.id) return false;
    const generation = epoch;
    pending.value.add(item.id);
    // 不允许开始点击前的查询响应覆盖点击后状态。
    ++listToken;
    ++countToken;
    loading.value = false;
    try {
      const result = await notificationApi.read(item.id, item.version);
      if (!active(generation)) return false;
      ++listToken;
      ++countToken;
      loading.value = false;
      items.value = items.value.map((row) =>
        row.id === item.id ? { ...row, readAt: result.readAt, version: result.version } : row,
      );
      pending.value.delete(item.id);
      // 数量以服务端为准；刷新不阻塞进入详情。
      void loadCount();
      if (readFilter.value === 'unread') void loadList();
      return true;
    } catch (error) {
      if (active(generation)) EMessage.error(error, '通知已读保存失败，请再次点击重试');
      return false;
    } finally {
      if (active(generation)) pending.value.delete(item.id);
    }
  };

  watch(
    () => auth.session?.user.id,
    (id) => {
      ++epoch;
      ++listToken;
      ++countToken;
      if (timer) clearInterval(timer);
      items.value = [];
      unreadCount.value = null;
      total.value = 0;
      page.value = 1;
      pending.value.clear();
      visible.value = false;
      loading.value = false;
      failed.value = false;
      if (id) {
        void loadCount();
        timer = setInterval(() => void loadCount(), 30_000);
      }
    },
    { immediate: true, flush: 'sync' },
  );
  onScopeDispose(() => {
    disposed = true;
    ++epoch;
    if (timer) clearInterval(timer);
  });
  return {
    items,
    unreadCount,
    total,
    page,
    pageSize,
    readFilter,
    loading,
    failed,
    visible,
    pending,
    open,
    refresh,
    changePage,
    changeFilter,
    read,
  };
}
