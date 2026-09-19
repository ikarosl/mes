import { Injectable } from '@nestjs/common';
import { NotificationAfterCommitHook } from '../application/notification-publish.js';

@Injectable()
export class NoopNotificationHook extends NotificationAfterCommitHook {
  handle(): void {
    /* 首期只提供站内通知。 */
  }
}
