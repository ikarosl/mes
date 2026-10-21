import { Injectable } from '@nestjs/common';
import { NOTIFICATION_EVENT_LABELS } from '@company/constants';
import type { NotificationEventType } from '@company/contracts';
import { NotificationService } from '../../notification/public.js';
import type { CommandContext } from '../../../common/audit/audit.types.js';

/** 调用方已在申请事务内创建真实动作并解析合格人员；摘要不复制证据或意见。 */
@Injectable()
export class ApprovalNotifications {
  constructor(private readonly notifications: NotificationService) {}
  publish(
    input: {
      actionId: string;
      instanceId: string;
      instanceTitle: string;
      eventType: Exclude<NotificationEventType, 'system_notice'>;
      recipientIds: string[];
      stepId?: string;
      stepName?: string;
    },
    audit: CommandContext,
  ) {
    const label = NOTIFICATION_EVENT_LABELS[input.eventType];
    return this.notifications.publish(
      {
        eventKey: `approval:${input.actionId}:${input.eventType}${input.stepId ? `:${input.stepId}` : ''}`,
        eventType: input.eventType,
        sourceType: 'approval_action',
        sourceId: input.actionId,
        targetType: 'approval_instance',
        targetId: input.instanceId,
        title: label,
        body: `“${input.instanceTitle}”${input.stepName ? `，节点“${input.stepName}”` : ''}：${label}。请查看详情了解当前处理结果。`,
        recipientIds: input.recipientIds,
      },
      audit,
    );
  }
}
