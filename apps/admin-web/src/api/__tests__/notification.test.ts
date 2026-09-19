import { beforeEach, describe, expect, it, vi } from 'vitest';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../http', () => ({ httpClient: { request } }));

describe('notificationApi', () => {
  beforeEach(() => {
    request.mockReset();
    request.mockResolvedValue({ data: undefined });
  });

  it('lists notifications with the server-side page and read filter', async () => {
    const { notificationApi } = await import('../notification');

    await notificationApi.list({ page: 2, pageSize: 10, read: 'unread' });

    expect(request).toHaveBeenCalledWith({
      url: '/notifications',
      params: { page: 2, pageSize: 10, read: 'unread' },
    });
  });

  it('keeps unread polling and read writes out of the base retry path', async () => {
    const { notificationApi } = await import('../notification');

    await notificationApi.unreadCount();
    await notificationApi.read('recipient/id', 4);

    expect(request).toHaveBeenNthCalledWith(1, {
      url: '/notifications/unread-count',
      skipRetry: true,
    });
    expect(request).toHaveBeenNthCalledWith(2, {
      url: '/notifications/recipient%2Fid/read',
      method: 'POST',
      data: { version: 4 },
      skipRetry: true,
    });
  });
});
