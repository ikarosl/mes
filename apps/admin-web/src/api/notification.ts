import type {
  NotificationItem,
  NotificationQuery,
  NotificationReadResult,
  NotificationUnreadCount,
  PageResult,
} from '@company/contracts';
import { toRequestError, type RetryRequestConfig } from '@company/request';
import { httpClient } from './http';

const request = async <T>(config: RetryRequestConfig): Promise<T> => {
  try {
    return (await httpClient.request<T>(config)).data;
  } catch (error) {
    throw toRequestError(error);
  }
};
export const notificationApi = {
  list: (params: NotificationQuery) =>
    request<PageResult<NotificationItem>>({ url: '/notifications', params }),
  unreadCount: () =>
    request<NotificationUnreadCount>({ url: '/notifications/unread-count', skipRetry: true }),
  read: (id: string, version: number) =>
    request<NotificationReadResult>({
      url: `/notifications/${encodeURIComponent(id)}/read`,
      method: 'POST',
      data: { version },
      skipRetry: true,
    }),
};
