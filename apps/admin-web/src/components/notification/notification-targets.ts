import type { NotificationItem, NotificationTargetType } from '@company/contracts';
import type { RouteLocationRaw } from 'vue-router';

const targetRoutes: Record<NotificationTargetType, (id: string) => RouteLocationRaw> = {
  approval_instance: (id) => ({ name: 'approval-inbox', query: { instanceId: id } }),
};
export function notificationTarget(item: NotificationItem): RouteLocationRaw | null {
  if (!item.targetType || !item.targetId) return null;
  return targetRoutes[item.targetType]?.(item.targetId) ?? null;
}
