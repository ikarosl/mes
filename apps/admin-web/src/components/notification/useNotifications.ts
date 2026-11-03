import { onScopeDispose, ref, watch } from 'vue';
import type { NotificationItem } from '@company/contracts';
import { notificationApi } from '../../api/notification';
import { useAuthStore } from '../../stores/auth';
import { EMessage } from '../../utils/message';

/** 顶部入口独占当前会话的列表和角标；不跨页面候选缓存或浏览器标签同步。 */
export function useNotifications() {
  const auth = useAuthStore();
  const items = ref<NotificationItem[]>([]);
  const unreadCount = ref<number | null>(null);
  const initializing = ref(false);
  const loading = ref(false);
  const loadingMore = ref(false);
  const failed = ref(false);
  const moreFailed = ref(false);
  const countFailed = ref(false);
  const markingRead = ref(false);
  const readFailed = ref(false);
  const hasMore = ref(false);
  const visible = ref(false);
  const highlightedIds = ref(new Set<string>());
  const listElement = ref<HTMLElement | null>(null);
  const pageSize = 10;
  let nextPage = 1;
  let epoch = 0,
    panelEpoch = 0,
    listToken = 0,
    countToken = 0,
    readToken = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  let disposed = false;
  const active = (generation: number) =>
    !disposed && generation === epoch && Boolean(auth.session?.user.id);
  const invalidateList = (): void => {
    ++listToken;
    loading.value = false;
    loadingMore.value = false;
  };
  const currentList = (generation: number, token: number): boolean =>
    active(generation) && token === listToken && visible.value;

  const loadCount = async (): Promise<void> => {
    if (!auth.session?.user.id || markingRead.value) return;
    const generation = epoch,
      token = ++countToken;
    countFailed.value = false;
    try {
      const result = await notificationApi.unreadCount();
      if (active(generation) && token === countToken) unreadCount.value = result.count;
    } catch (error) {
      if (!active(generation) || token !== countToken) return;
      countFailed.value = true;
      EMessage.error(error, '通知未读数刷新失败');
    }
  };
  const loadList = async (): Promise<void> => {
    if (!auth.session?.user.id || !visible.value) return;
    const generation = epoch,
      token = ++listToken;
    loading.value = true;
    loadingMore.value = false;
    failed.value = false;
    moreFailed.value = false;
    try {
      const result = await notificationApi.list({ page: 1, pageSize });
      if (!currentList(generation, token)) return;
      items.value = result.items;
      nextPage = 2;
      // 总数与明细可能读到不同提交时点；仅以原始页是否已读尽判断还有无历史。
      hasMore.value = result.items.length === pageSize;
      if (listElement.value) listElement.value.scrollTop = 0;
    } catch (error) {
      if (!currentList(generation, token)) return;
      failed.value = true;
      EMessage.error(error, '通知列表加载失败');
    } finally {
      if (currentList(generation, token)) loading.value = false;
    }
  };
  const loadMore = async (): Promise<void> => {
    if (
      !auth.session?.user.id ||
      !visible.value ||
      initializing.value ||
      markingRead.value ||
      loading.value ||
      loadingMore.value ||
      failed.value ||
      !hasMore.value
    )
      return;
    const generation = epoch,
      token = listToken;
    loadingMore.value = true;
    moreFailed.value = false;
    try {
      while (hasMore.value) {
        const requestedPage = nextPage;
        const result = await notificationApi.list({ page: requestedPage, pageSize });
        if (!currentList(generation, token)) return;
        const seen = new Set(items.value.map((item) => item.id));
        const added = result.items.filter((item) => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });
        items.value = [...items.value, ...added];
        // 新通知可能使整页重复；仍推进原始页码，继续寻找更早通知。
        nextPage = requestedPage + 1;
        hasMore.value = result.items.length === pageSize;
        if (added.length) break;
      }
    } catch (error) {
      if (!currentList(generation, token)) return;
      moreFailed.value = true;
      EMessage.error(error, '更早通知加载失败');
    } finally {
      if (currentList(generation, token)) loadingMore.value = false;
    }
  };
  const refresh = async (): Promise<void> => {
    if (initializing.value || markingRead.value || loading.value) return;
    await Promise.all([loadList(), loadCount()]);
  };
  const markAllRead = async (): Promise<void> => {
    if (!auth.session?.user.id) return;
    const generation = epoch,
      panelGeneration = panelEpoch,
      token = ++readToken;
    const currentRead = (): boolean =>
      active(generation) && visible.value && panelGeneration === panelEpoch && token === readToken;
    markingRead.value = true;
    invalidateList();
    ++countToken;
    try {
      const result = await notificationApi.readAll();
      if (currentRead()) {
        highlightedIds.value = new Set(result.unreadIds);
        readFailed.value = false;
      }
    } catch (error) {
      if (currentRead()) {
        readFailed.value = true;
        EMessage.error(error, '通知已读状态更新未确认，请重试');
      }
    } finally {
      if (active(generation) && token === readToken) {
        markingRead.value = false;
        if (currentRead()) {
          await Promise.all([loadList(), loadCount()]);
          if (currentRead()) initializing.value = false;
        }
      }
    }
  };
  const preparePanel = (): void => {
    ++panelEpoch;
    initializing.value = true;
    items.value = [];
    highlightedIds.value = new Set();
    readFailed.value = false;
    nextPage = 1;
    hasMore.value = false;
    void markAllRead();
  };
  const retryReadAll = (): void => {
    if (!initializing.value && !markingRead.value) void markAllRead();
  };
  const loadOnScroll = (): void => {
    const target = listElement.value;
    if (!target || moreFailed.value) return;
    if (target.scrollHeight - target.scrollTop - target.clientHeight <= 32) void loadMore();
  };

  watch(
    visible,
    (isVisible) => {
      if (isVisible) {
        preparePanel();
      } else {
        ++panelEpoch;
        highlightedIds.value = new Set();
        invalidateList();
      }
    },
    { flush: 'sync' },
  );
  watch(
    () => auth.session?.user.id,
    (id) => {
      ++epoch;
      ++panelEpoch;
      invalidateList();
      ++countToken;
      ++readToken;
      if (timer) clearInterval(timer);
      items.value = [];
      highlightedIds.value = new Set();
      unreadCount.value = null;
      nextPage = 1;
      visible.value = false;
      initializing.value = false;
      failed.value = false;
      moreFailed.value = false;
      countFailed.value = false;
      markingRead.value = false;
      readFailed.value = false;
      hasMore.value = false;
      if (id) {
        void loadCount();
        timer = setInterval(() => {
          if (!visible.value || !initializing.value) void loadCount();
        }, 30_000);
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
    initializing,
    loading,
    loadingMore,
    failed,
    moreFailed,
    countFailed,
    markingRead,
    readFailed,
    hasMore,
    visible,
    highlightedIds,
    listElement,
    refresh,
    loadMore,
    loadOnScroll,
    retryReadAll,
  };
}
