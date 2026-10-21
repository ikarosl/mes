import type {
  NotificationEventType,
  NotificationSourceType,
  NotificationTargetType,
} from '@company/contracts';

export interface PublishNotification {
  eventKey: string;
  eventType: NotificationEventType;
  sourceType: NotificationSourceType | null;
  sourceId: string | null;
  targetType: NotificationTargetType | null;
  targetId: string | null;
  title: string;
  body: string;
  recipientIds: readonly string[];
}
export type PublishNotificationResult =
  | { status: 'created' | 'reused'; notificationId: string }
  | { status: 'no_recipients'; notificationId: null };

export interface CommittedNotification {
  readonly notificationId: string;
  readonly eventKey: string;
  readonly eventType: NotificationEventType;
  readonly sourceType: NotificationSourceType | null;
  readonly sourceId: string | null;
  readonly targetType: NotificationTargetType | null;
  readonly targetId: string | null;
  readonly recipientIds: readonly string[];
  readonly requestId: string;
}

/** 首期默认空实现；外部渠道接入时另行设计可靠性、超时与容量。 */
export abstract class NotificationAfterCommitHook {
  abstract handle(event: CommittedNotification): void | Promise<void>;
}
