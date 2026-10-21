export type NotificationErrorCode =
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'CONCURRENT_MODIFICATION'
  | 'NOTIFICATION_EVENT_CONFLICT';
export class NotificationDomainError extends Error {
  constructor(
    readonly code: NotificationErrorCode,
    message: string,
  ) {
    super(message);
  }
}
