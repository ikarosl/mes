import { describe, expect, it, vi } from 'vitest';
import type { NotificationQuery } from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
import { NotificationDomainError } from '../../domain/notification.errors.js';
import type { PublishNotification } from '../notification-publish.js';
import { NotificationService } from '../notification.service.js';

const context: CommandContext = {
  actorId: '7',
  requestId: 'notification-test',
  ip: null,
  userAgent: null,
};

const input: PublishNotification = {
  eventKey: 'approval:action-1:approval_task_assigned',
  eventType: 'approval_task_assigned',
  sourceType: 'approval_action',
  sourceId: '11',
  targetType: 'approval_instance',
  targetId: '12',
  title: '审批待处理',
  body: '请处理审批',
  recipientIds: ['9', '10'],
};

const repository = () => ({
  publish: vi.fn().mockResolvedValue({ status: 'created', notificationId: '20' }),
  list: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 }),
  unreadCount: vi.fn().mockResolvedValue({ count: 0 }),
  read: vi.fn().mockResolvedValue({
    id: '20',
    readAt: '2026-09-14T12:00:00.000+08:00',
    version: 1,
  }),
});

describe('NotificationService', () => {
  it('normalizes event text and recipient ids before crossing the repository port', async () => {
    const persistence = repository();
    const service = new NotificationService(persistence as never);

    await expect(
      service.publish(
        {
          ...input,
          eventKey: '  approval:action-1:approval_task_assigned  ',
          title: '  审批待处理  ',
          body: '  请处理审批  ',
          recipientIds: ['10', '9', '10'],
        },
        context,
      ),
    ).resolves.toEqual({ status: 'created', notificationId: '20' });

    expect(persistence.publish).toHaveBeenCalledWith(
      {
        ...input,
        eventKey: 'approval:action-1:approval_task_assigned',
        title: '审批待处理',
        body: '请处理审批',
        recipientIds: ['10', '9'],
      },
      context,
    );
  });

  it('accepts the unsigned BIGINT boundary for actor and referenced ids', async () => {
    const persistence = repository();
    const service = new NotificationService(persistence as never);
    const maxId = '18446744073709551615';

    await expect(
      service.publish(
        {
          ...input,
          sourceId: maxId,
          targetId: maxId,
          recipientIds: [maxId],
        },
        { ...context, actorId: maxId },
      ),
    ).resolves.toEqual({ status: 'created', notificationId: '20' });
    expect(persistence.publish).toHaveBeenCalledOnce();
  });

  it.each([
    ['event key must start with a lowercase letter', { eventKey: '1:action' }],
    ['event key must contain at least two characters', { eventKey: 'a' }],
    ['event key cannot exceed 150 characters', { eventKey: `a${'b'.repeat(150)}` }],
    ['event type must be registered', { eventType: 'unknown_event' }],
    ['title is required after trimming', { title: '   ' }],
    ['title is limited by Unicode characters', { title: '中'.repeat(256) }],
    ['body is required after trimming', { body: '   ' }],
    ['body is limited by Unicode characters', { body: '中'.repeat(4001) }],
    ['recipient ids must be positive canonical decimals', { recipientIds: ['0'] }],
    ['recipient ids cannot contain leading zeroes', { recipientIds: ['01'] }],
    ['recipient ids cannot exceed unsigned BIGINT', { recipientIds: ['18446744073709551616'] }],
    ['source type and id are paired', { sourceType: null }],
    ['source type must be registered', { sourceType: 'other_source', sourceId: '11' }],
    ['source id must be canonical', { sourceId: '01' }],
    ['target type and id are paired', { targetId: null }],
    ['target type must be registered', { targetType: 'other_target', targetId: '12' }],
    ['target id must be canonical', { targetId: '0' }],
  ] as const)('rejects invalid publish input: %s', (_reason, patch) => {
    const persistence = repository();
    const service = new NotificationService(persistence as never);

    expect(() =>
      service.publish({ ...input, ...patch } as unknown as PublishNotification, context),
    ).toThrowError(
      new NotificationDomainError('INVALID_INPUT', '通知事件、文本、引用或收件人格式不正确'),
    );
    expect(persistence.publish).not.toHaveBeenCalled();
  });

  it.each([null, '0', '01', '18446744073709551616'])(
    'rejects publish and read without a valid actor id: %s',
    (actorId) => {
      const persistence = repository();
      const service = new NotificationService(persistence as never);
      const audit = { ...context, actorId };

      expect(() => service.publish(input, audit)).toThrowError(
        new NotificationDomainError('FORBIDDEN', '通知操作需要登录身份'),
      );
      expect(() => service.read('20', 0, audit)).toThrowError(
        new NotificationDomainError('FORBIDDEN', '通知操作需要登录身份'),
      );
      expect(persistence.publish).not.toHaveBeenCalled();
      expect(persistence.read).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['0', 0],
    ['01', 0],
    ['18446744073709551616', 0],
    ['20', -1],
    ['20', 0.5],
    ['20', 2_147_483_648],
  ] as const)('rejects invalid read command %s/version %s before storage', (id, version) => {
    const persistence = repository();
    const service = new NotificationService(persistence as never);

    expect(() => service.read(id, version, context)).toThrowError(
      new NotificationDomainError('INVALID_INPUT', '通知 ID 或版本无效'),
    );
    expect(persistence.read).not.toHaveBeenCalled();
  });

  it('passes authenticated identity and read command through the application boundary', async () => {
    const persistence = repository();
    const service = new NotificationService(persistence as never);
    const query: NotificationQuery = { page: 2, pageSize: 20, read: 'unread' };

    await expect(service.list(query, '7')).resolves.toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 10,
    });
    await expect(service.unreadCount('7')).resolves.toEqual({ count: 0 });
    await expect(service.read('20', 0, context)).resolves.toEqual({
      id: '20',
      readAt: '2026-09-14T12:00:00.000+08:00',
      version: 1,
    });

    expect(persistence.list).toHaveBeenCalledWith(query, '7');
    expect(persistence.unreadCount).toHaveBeenCalledWith('7');
    expect(persistence.read).toHaveBeenCalledWith('20', 0, context);
  });
});
