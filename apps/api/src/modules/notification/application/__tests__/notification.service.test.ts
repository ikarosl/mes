import { describe, expect, it, vi } from 'vitest';
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
    'rejects publish without a valid actor id: %s',
    (actorId) => {
      const persistence = repository();
      const service = new NotificationService(persistence as never);
      const audit = { ...context, actorId };

      expect(() => service.publish(input, audit)).toThrowError(
        new NotificationDomainError('FORBIDDEN', '请先登录后再操作通知'),
      );
      expect(persistence.publish).not.toHaveBeenCalled();
    },
  );

  // TODO(notification-read-all-application): 验证批量已读拒绝无效操作者并向仓储传递认证命令上下文；该身份边界重要，旧单条已读入口已移除且正式测试暂缓；获明确正式测试授权后按批量已读契约恢复。
});
