import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '@company/contracts';
import {
  AUDIT_IN_APPLICATION,
  IS_PUBLIC,
  REQUIRED_PERMISSION,
} from '../../../../../common/security/auth.decorators.js';
import type { CommandContext } from '../../../../../common/audit/audit.types.js';
import { NotificationController } from '../notification.controller.js';

const user: UserProfile = {
  id: '42',
  username: 'reviewer',
  displayName: '审批人',
  roles: [],
  permissions: [],
};
const audit: CommandContext = {
  actorId: user.id,
  requestId: 'notification-http-test',
  ip: null,
  userAgent: null,
};

describe('NotificationController', () => {
  it('uses the authenticated user for list and unread-count queries', async () => {
    const service = {
      list: vi.fn().mockResolvedValue({ items: [], total: 0, page: 2, pageSize: 10 }),
      unreadCount: vi.fn().mockResolvedValue({ count: 3 }),
    };
    const controller = new NotificationController(service as never);
    const query = { page: 2, pageSize: 10, read: 'unread' as const };

    await expect(controller.list(query, user)).resolves.toEqual({
      items: [],
      total: 0,
      page: 2,
      pageSize: 10,
    });
    await expect(controller.unreadCount(user)).resolves.toEqual({ count: 3 });
    expect(service.list).toHaveBeenCalledWith(query, user.id);
    expect(service.unreadCount).toHaveBeenCalledWith(user.id);
  });

  it('passes the authenticated command context to the read use case', async () => {
    const service = {
      read: vi.fn().mockResolvedValue({
        id: '99',
        readAt: '2026-09-14T12:00:00.000+08:00',
        version: 1,
      }),
    };
    const controller = new NotificationController(service as never);

    await expect(controller.read({ id: '99' }, { version: 0 }, audit)).resolves.toEqual({
      id: '99',
      readAt: '2026-09-14T12:00:00.000+08:00',
      version: 1,
    });
    expect(service.read).toHaveBeenCalledWith('99', 0, audit);
  });

  it('keeps notification endpoints login-only and free of revocable business permission metadata', () => {
    const prototype = NotificationController.prototype;

    expect(Reflect.getMetadata(IS_PUBLIC, prototype.list)).toBeUndefined();
    expect(Reflect.getMetadata(IS_PUBLIC, prototype.unreadCount)).toBeUndefined();
    expect(Reflect.getMetadata(IS_PUBLIC, prototype.read)).toBeUndefined();
    expect(Reflect.getMetadata(REQUIRED_PERMISSION, prototype.list)).toBeUndefined();
    expect(Reflect.getMetadata(REQUIRED_PERMISSION, prototype.unreadCount)).toBeUndefined();
    expect(Reflect.getMetadata(REQUIRED_PERMISSION, prototype.read)).toBeUndefined();
    expect(Reflect.getMetadata(AUDIT_IN_APPLICATION, prototype.read)).toBe(true);
  });
});
