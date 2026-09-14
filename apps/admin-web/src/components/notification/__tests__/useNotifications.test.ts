import { flushPromises } from '@vue/test-utils';
import { effectScope } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import type { AuthSession } from '@company/auth-client';
import type {
  NotificationItem,
  NotificationReadResult,
  PageResult,
  NotificationUnreadCount,
} from '@company/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../../stores/auth';
import { useNotifications } from '../useNotifications';

const { list, unreadCount, read, error } = vi.hoisted(() => ({
  list: vi.fn(),
  unreadCount: vi.fn(),
  read: vi.fn(),
  error: vi.fn(),
}));
vi.mock('../../../api/notification', () => ({ notificationApi: { list, unreadCount, read } }));
vi.mock('../../../utils/message', () => ({ EMessage: { error } }));

const item = (overrides: Partial<NotificationItem> = {}): NotificationItem => ({
  id: '1',
  notificationId: '10',
  eventType: 'system_notice',
  title: '系统通知',
  body: '通知正文',
  targetType: null,
  targetId: null,
  createdAt: '2026-09-14T10:00:00+08:00',
  readAt: null,
  version: 0,
  ...overrides,
});

const sessionFor = (id: string): AuthSession => ({
  user: { id, username: id, displayName: id, roles: [], permissions: [] },
  accessToken: `access-${id}`,
  accessTokenExpiresAt: new Date(Date.now() + 300_000).toISOString(),
  refreshTokenExpiresAt: new Date(Date.now() + 600_000).toISOString(),
});

const listResult = (rows: NotificationItem[] = [item()]): PageResult<NotificationItem> => ({
  items: rows,
  total: rows.length,
  page: 1,
  pageSize: 10,
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

describe('useNotifications', () => {
  const scopes: ReturnType<typeof effectScope>[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    list.mockReset().mockResolvedValue(listResult());
    unreadCount.mockReset().mockResolvedValue({ count: 1 } satisfies NotificationUnreadCount);
    read.mockReset().mockResolvedValue({
      id: '1',
      readAt: '2026-09-14T10:01:00+08:00',
      version: 1,
    } satisfies NotificationReadResult);
    error.mockReset();
  });

  afterEach(() => {
    for (const scope of scopes.splice(0)) scope.stop();
    vi.useRealTimers();
  });

  const mountComposable = (userId = '1') => {
    const auth = useAuthStore();
    auth.session = sessionFor(userId);
    const scope = effectScope();
    scopes.push(scope);
    let state!: ReturnType<typeof useNotifications>;
    scope.run(() => {
      state = useNotifications();
    });
    return { auth, state, scope };
  };

  it('polls only the unread count every 30 seconds and stops after scope disposal', async () => {
    const { state, scope } = mountComposable('1');
    await flushPromises();

    expect(unreadCount).toHaveBeenCalledTimes(1);
    expect(list).not.toHaveBeenCalled();
    expect(state.items.value).toEqual([]);

    vi.advanceTimersByTime(29_999);
    await flushPromises();
    expect(unreadCount).toHaveBeenCalledTimes(1);
    expect(list).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    await flushPromises();
    expect(unreadCount).toHaveBeenCalledTimes(2);
    expect(list).not.toHaveBeenCalled();

    scope.stop();
    vi.advanceTimersByTime(30_000);
    await flushPromises();
    expect(unreadCount).toHaveBeenCalledTimes(2);
  });

  it('fetches the paged list only after opening or explicitly refreshing the entry', async () => {
    const { state } = mountComposable('1');
    await flushPromises();
    vi.advanceTimersByTime(30_000);
    await flushPromises();
    expect(list).not.toHaveBeenCalled();

    state.open();
    await flushPromises();
    expect(list).toHaveBeenCalledWith({ page: 1, pageSize: 10, read: 'all' });
    expect(state.items.value).toHaveLength(1);

    state.refresh();
    await flushPromises();
    expect(list).toHaveBeenCalledTimes(2);
    expect(unreadCount).toHaveBeenCalledTimes(4);
  });

  it('keeps only the latest same-account list and unread-count responses', async () => {
    const { state } = mountComposable('1');
    await flushPromises();

    const firstList = deferred<PageResult<NotificationItem>>();
    const secondList = deferred<PageResult<NotificationItem>>();
    list
      .mockReset()
      .mockImplementationOnce(() => firstList.promise)
      .mockImplementationOnce(() => secondList.promise);
    state.changePage(1);
    state.changePage(2);

    secondList.resolve(listResult([item({ id: '2' })]));
    await flushPromises();
    firstList.resolve(listResult([item({ id: '3' })]));
    await flushPromises();
    expect(state.items.value).toMatchObject([{ id: '2' }]);

    const firstCount = deferred<NotificationUnreadCount>();
    const secondCount = deferred<NotificationUnreadCount>();
    unreadCount
      .mockReset()
      .mockImplementationOnce(() => firstCount.promise)
      .mockImplementationOnce(() => secondCount.promise);
    vi.advanceTimersByTime(30_000);
    vi.advanceTimersByTime(30_000);

    secondCount.resolve({ count: 22 });
    await flushPromises();
    firstCount.resolve({ count: 11 });
    await flushPromises();
    expect(state.unreadCount.value).toBe(22);
  });

  it('clears session data and ignores late count/list responses after logout or account switch', async () => {
    const countA = deferred<NotificationUnreadCount>();
    const countB = deferred<NotificationUnreadCount>();
    const listA = deferred<PageResult<NotificationItem>>();
    unreadCount
      .mockReset()
      .mockImplementationOnce(() => countA.promise)
      .mockImplementationOnce(() => countB.promise);
    list.mockReset().mockImplementationOnce(() => listA.promise);

    const { auth, state } = mountComposable('1');
    state.changePage(2);
    auth.session = sessionFor('2');

    countA.resolve({ count: 41 });
    listA.resolve(listResult([item({ id: '3' })]));
    await flushPromises();
    expect(state.unreadCount.value).toBeNull();
    expect(state.items.value).toEqual([]);

    auth.session = null;
    countB.resolve({ count: 7 });
    await flushPromises();
    expect(state.unreadCount.value).toBeNull();
    expect(state.items.value).toEqual([]);

    vi.advanceTimersByTime(30_000);
    await flushPromises();
    expect(unreadCount).toHaveBeenCalledTimes(2);
  });

  it('allows one read request per notification and updates the row only after success', async () => {
    const { state } = mountComposable('1');
    await flushPromises();
    state.open();
    await flushPromises();
    const notification = state.items.value[0]!;
    const result = deferred<NotificationReadResult>();
    read.mockReset().mockImplementation(() => result.promise);

    const first = state.read(notification);
    const duplicate = await state.read(notification);
    expect(duplicate).toBe(false);
    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith('1', 0);
    expect(state.pending.value.has(notification.id)).toBe(true);
    expect(state.items.value[0]?.readAt).toBeNull();

    result.resolve({
      id: notification.id,
      readAt: '2026-09-14T10:01:00+08:00',
      version: 1,
    });
    await expect(first).resolves.toBe(true);
    await flushPromises();
    expect(state.pending.value.has(notification.id)).toBe(false);
    expect(state.items.value[0]).toMatchObject({
      id: notification.id,
      readAt: '2026-09-14T10:01:00+08:00',
      version: 1,
    });
  });

  it('ignores a late read response after switching accounts while the read is pending', async () => {
    const { auth, state } = mountComposable('1');
    await flushPromises();
    state.open();
    await flushPromises();
    const notification = state.items.value[0]!;
    const result = deferred<NotificationReadResult>();
    read.mockReset().mockImplementation(() => result.promise);

    const pendingRead = state.read(notification);
    auth.session = sessionFor('2');
    expect(state.items.value).toEqual([]);
    expect(state.unreadCount.value).toBeNull();

    result.resolve({
      id: notification.id,
      readAt: '2026-09-14T10:03:00+08:00',
      version: 1,
    });
    await expect(pendingRead).resolves.toBe(false);
    await flushPromises();

    expect(state.items.value).toEqual([]);
    expect(state.pending.value.size).toBe(0);
  });

  it('keeps an unread row after a failed read and permits retry', async () => {
    const { state } = mountComposable('1');
    await flushPromises();
    state.open();
    await flushPromises();
    const notification = state.items.value[0]!;
    const failure = new Error('保存失败');
    read.mockReset().mockRejectedValueOnce(failure).mockResolvedValueOnce({
      id: notification.id,
      readAt: '2026-09-14T10:02:00+08:00',
      version: 1,
    });

    await expect(state.read(notification)).resolves.toBe(false);
    expect(state.items.value[0]?.readAt).toBeNull();
    expect(state.pending.value.has(notification.id)).toBe(false);
    expect(error).toHaveBeenCalledWith(failure, '通知已读保存失败，请再次点击重试');

    await expect(state.read(notification)).resolves.toBe(true);
    expect(read).toHaveBeenCalledTimes(2);
    expect(state.items.value[0]?.readAt).toBe('2026-09-14T10:02:00+08:00');
  });
});
