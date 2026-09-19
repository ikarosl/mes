import { describe, expect, it, vi } from 'vitest';
import { NotificationDomainError } from '../../../domain/notification.errors.js';
import { NotificationDomainExceptionFilter } from '../notification-domain-exception.filter.js';

const invoke = (error: NotificationDomainError) => {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const setHeader = vi.fn();
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({
        originalUrl: '/api/notifications/99/read',
        requestId: 'notification-request',
      }),
      getResponse: () => ({ status, setHeader }),
    }),
  };

  new NotificationDomainExceptionFilter().catch(error, host as never);
  return { json, status, setHeader };
};

describe('NotificationDomainExceptionFilter', () => {
  it.each([
    ['NOT_FOUND', 404],
    ['FORBIDDEN', 403],
    ['CONCURRENT_MODIFICATION', 409],
    ['NOTIFICATION_EVENT_CONFLICT', 409],
    ['INVALID_INPUT', 400],
  ] as const)('maps %s to the expected HTTP envelope', (code, expectedStatus) => {
    const { json, status, setHeader } = invoke(new NotificationDomainError(code, '通知业务错误'));

    expect(status).toHaveBeenCalledWith(expectedStatus);
    expect(setHeader).toHaveBeenCalledWith('x-request-id', 'notification-request');
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: expectedStatus,
        code,
        message: '通知业务错误',
        requestId: 'notification-request',
        path: '/api/notifications/99/read',
        timestamp: expect.stringMatching(/\+08:00$/),
      }),
    );
  });
});
