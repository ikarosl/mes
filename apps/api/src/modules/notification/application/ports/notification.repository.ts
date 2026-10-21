import type {
  NotificationItem,
  NotificationQuery,
  NotificationReadResult,
  PageResult,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
import type { PublishNotification, PublishNotificationResult } from '../notification-publish.js';

export abstract class NotificationRepository {
  abstract publish(
    input: PublishNotification,
    audit: CommandContext,
  ): Promise<PublishNotificationResult>;
  abstract list(query: NotificationQuery, actorId: string): Promise<PageResult<NotificationItem>>;
  abstract unreadCount(actorId: string): Promise<{ count: number }>;
  abstract read(
    id: string,
    version: number,
    audit: CommandContext,
  ): Promise<NotificationReadResult>;
}
