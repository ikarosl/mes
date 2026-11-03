import type { PageQuery } from './common.js';

export type NotificationEventType =
  | 'approval_task_assigned'
  | 'approval_approved'
  | 'approval_rejected'
  | 'approval_withdrawn'
  | 'system_notice';
export type NotificationSourceType = 'approval_action';
export type NotificationTargetType = 'approval_instance';
export type NotificationQuery = PageQuery;
export interface NotificationItem {
  /** 本人收件记录 ID。 */
  id: string;
  notificationId: string;
  eventType: NotificationEventType;
  title: string;
  body: string;
  targetType: NotificationTargetType | null;
  targetId: string | null;
  createdAt: string;
  isUnread: boolean;
}
export interface NotificationUnreadCount {
  count: number;
}
export interface NotificationReadAllResult {
  readCount: number;
  /** 确认前查询到的本人未读收件 ID，仅用于面板提示，不限定更新范围。 */
  unreadIds: string[];
}
