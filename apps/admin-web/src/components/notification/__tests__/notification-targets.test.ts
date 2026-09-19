import type { NotificationItem } from '@company/contracts';
import { describe, expect, it } from 'vitest';
import { notificationTarget } from '../notification-targets';

const item = (overrides: Partial<NotificationItem> = {}): NotificationItem => ({
  id: '1',
  notificationId: '10',
  eventType: 'approval_task_assigned',
  title: '审批待处理',
  body: '请处理审批申请',
  targetType: 'approval_instance',
  targetId: '100',
  createdAt: '2026-09-14T10:00:00+08:00',
  readAt: null,
  version: 0,
  ...overrides,
});

describe('notificationTarget', () => {
  it('maps an approval target to the stable inbox route and instance query', () => {
    expect(notificationTarget(item({ targetId: '101' }))).toEqual({
      name: 'approval-inbox',
      query: { instanceId: '101' },
    });
  });

  it('does not invent a route when the target is incomplete or unknown', () => {
    expect(notificationTarget(item({ targetType: null, targetId: null }))).toBeNull();
    expect(
      notificationTarget(item({ targetType: 'approval_instance', targetId: null })),
    ).toBeNull();
    expect(
      notificationTarget(item({ targetType: 'future_target' as NotificationItem['targetType'] })),
    ).toBeNull();
  });
});
