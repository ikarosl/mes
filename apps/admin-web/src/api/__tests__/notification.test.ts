import { beforeEach, describe, expect, it, vi } from 'vitest';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../http', () => ({ httpClient: { request } }));

describe('notificationApi', () => {
  beforeEach(() => {
    request.mockReset();
    request.mockResolvedValue({ data: undefined });
  });

  it('keeps unread polling out of the base retry path', async () => {
    const { notificationApi } = await import('../notification');

    await notificationApi.unreadCount();

    expect(request).toHaveBeenNthCalledWith(1, {
      url: '/notifications/unread-count',
      skipRetry: true,
    });
  });

  // TODO(notification-read-all-retry): 验证批量已读写请求不自动重试且只发送空对象；自动重试可能扩大确认集合，该写入边界重要，旧单条已读封装已移除且正式测试暂缓；获明确正式测试授权后按批量契约恢复。
});
