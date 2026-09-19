import { Injectable } from '@nestjs/common';
import {
  NOTIFICATION_EVENT_TYPES,
  NOTIFICATION_SOURCE_TYPES,
  NOTIFICATION_TARGET_TYPES,
} from '@company/constants';
import type { NotificationQuery } from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { NotificationDomainError } from '../domain/notification.errors.js';
import { NotificationRepository } from './ports/notification.repository.js';
import type { PublishNotification } from './notification-publish.js';

const validId = (id: string): boolean =>
  /^[1-9]\d{0,19}$/.test(id) && BigInt(id) <= 18446744073709551615n;

@Injectable()
export class NotificationService {
  constructor(private readonly repository: NotificationRepository) {}

  publish(input: PublishNotification, audit: CommandContext) {
    this.requireActor(audit);
    const normalized = {
      ...input,
      eventKey: input.eventKey.trim(),
      title: input.title.trim(),
      body: input.body.trim(),
      recipientIds: [...new Set(input.recipientIds)].sort(),
    };
    if (
      !/^[a-z][a-z0-9_.:-]{1,149}$/.test(normalized.eventKey) ||
      !NOTIFICATION_EVENT_TYPES.includes(input.eventType) ||
      !normalized.title ||
      [...normalized.title].length > 255 ||
      !normalized.body ||
      [...normalized.body].length > 4000 ||
      !normalized.recipientIds.every(validId) ||
      (input.sourceType === null) !== (input.sourceId === null) ||
      (input.targetType === null) !== (input.targetId === null) ||
      (input.sourceType !== null && !NOTIFICATION_SOURCE_TYPES.includes(input.sourceType)) ||
      (input.targetType !== null && !NOTIFICATION_TARGET_TYPES.includes(input.targetType)) ||
      (input.sourceId !== null && !validId(input.sourceId)) ||
      (input.targetId !== null && !validId(input.targetId))
    ) {
      throw new NotificationDomainError('INVALID_INPUT', '通知事件、文本、引用或收件人格式不正确');
    }
    return this.repository.publish(normalized, audit);
  }
  list(query: NotificationQuery, actorId: string) {
    return this.repository.list(query, actorId);
  }
  unreadCount(actorId: string) {
    return this.repository.unreadCount(actorId);
  }
  read(id: string, version: number, audit: CommandContext) {
    this.requireActor(audit);
    if (!validId(id) || !Number.isInteger(version) || version < 0 || version > 2147483647)
      throw new NotificationDomainError('INVALID_INPUT', '通知 ID 或版本无效');
    return this.repository.read(id, version, audit);
  }
  private requireActor(audit: CommandContext) {
    if (!audit.actorId || !validId(audit.actorId))
      throw new NotificationDomainError('FORBIDDEN', '通知操作需要登录身份');
  }
}
