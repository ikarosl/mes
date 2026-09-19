import { describe, expect, it, vi } from 'vitest';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
import { ApprovalNotifications } from '../approval-notifications.js';

const context: CommandContext = {
  actorId: '7',
  requestId: 'approval-notification-test',
  ip: null,
  userAgent: null,
};

describe('ApprovalNotifications', () => {
  it('maps a task assignment to a node-scoped notification without copying approval evidence', async () => {
    const notifications = {
      publish: vi.fn().mockResolvedValue({ status: 'created', notificationId: '90' }),
    };
    const publisher = new ApprovalNotifications(notifications as never);

    await expect(
      publisher.publish(
        {
          actionId: '300',
          instanceId: '301',
          instanceTitle: 'BOM-2026',
          eventType: 'approval_task_assigned',
          recipientIds: ['11', '12'],
          stepId: '21',
          stepName: '一级审核',
        },
        context,
      ),
    ).resolves.toEqual({ status: 'created', notificationId: '90' });

    expect(notifications.publish).toHaveBeenCalledWith(
      {
        eventKey: 'approval:300:approval_task_assigned:21',
        eventType: 'approval_task_assigned',
        sourceType: 'approval_action',
        sourceId: '300',
        targetType: 'approval_instance',
        targetId: '301',
        title: '审批待处理',
        body: '“BOM-2026”，节点“一级审核”：审批待处理。请查看详情了解当前处理结果。',
        recipientIds: ['11', '12'],
      },
      context,
    );
    expect(notifications.publish.mock.calls[0]?.[0].body).not.toContain('comment');
  });

  it.each([
    ['approval_approved', '审批已通过'],
    ['approval_rejected', '审批已驳回'],
    ['approval_withdrawn', '审批已撤回'],
  ] as const)(
    'maps a terminal approval action without a step suffix: %s',
    async (eventType, label) => {
      const notifications = {
        publish: vi.fn().mockResolvedValue({ status: 'created', notificationId: '91' }),
      };
      const publisher = new ApprovalNotifications(notifications as never);

      await publisher.publish(
        {
          actionId: '400',
          instanceId: '401',
          instanceTitle: '申请单',
          eventType,
          recipientIds: ['8'],
        },
        context,
      );

      expect(notifications.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          eventKey: `approval:400:${eventType}`,
          title: label,
          body: `“申请单”：${label}。请查看详情了解当前处理结果。`,
        }),
        context,
      );
    },
  );
});
