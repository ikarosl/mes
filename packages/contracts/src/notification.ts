import type { PageQuery } from './common.js';

export type NotificationEventType =
  | 'approval_task_assigned'
  | 'approval_approved'
  | 'approval_rejected'
  | 'approval_withdrawn'
  | 'system_notice';
export type NotificationSourceType = 'approval_action';
export type NotificationTargetType = 'approval_instance';
export type NotificationReadFilter = 'all' | 'unread';
export interface NotificationQuery extends PageQuery {
  read?: NotificationReadFilter;
}
export interface NotificationItem {
  /** 本人收件记录 ID，用于点击已读。 */
  id: string;
  notificationId: string;
  eventType: NotificationEventType;
  title: string;
  body: string;
  targetType: NotificationTargetType | null;
  targetId: string | null;
  createdAt: string;
  readAt: string | null;
  version: number;
}
export interface NotificationUnreadCount {
  count: number;
}
export interface ReadNotificationCommand {
  version: number;
}
export interface NotificationReadResult {
  id: string;
  readAt: string;
  version: number;
}
