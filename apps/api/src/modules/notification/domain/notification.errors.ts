export type NotificationErrorCode = 'INVALID_INPUT' | 'FORBIDDEN' | 'NOTIFICATION_EVENT_CONFLICT';
export class NotificationDomainError extends Error {
  constructor(
    readonly code: NotificationErrorCode,
    message: string,
  ) {
    super(message);
  }
}
