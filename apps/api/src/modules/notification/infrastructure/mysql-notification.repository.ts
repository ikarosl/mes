import { Inject, Injectable, Logger } from '@nestjs/common';
import { registerAfterCommit, withActiveConnection, withTransaction } from '@company/database';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  NotificationItem,
  NotificationQuery,
  NotificationReadResult,
  PageResult,
} from '@company/contracts';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import { toBeijingISOString } from '../../../common/time/date-time.js';
import { NotificationRepository } from '../application/ports/notification.repository.js';
import {
  NotificationAfterCommitHook,
  type CommittedNotification,
  type PublishNotification,
  type PublishNotificationResult,
} from '../application/notification-publish.js';
import { NotificationDomainError } from '../domain/notification.errors.js';

interface MessageRow extends RowDataPacket {
  id: string;
  event_type: PublishNotification['eventType'];
  source_type: PublishNotification['sourceType'];
  source_id: string | null;
  target_type: PublishNotification['targetType'];
  target_id: string | null;
  title: string;
  body: string;
}
interface ReceiptRow extends RowDataPacket {
  id: string;
  user_id: string;
  read_at: Date | null;
  version: number;
}
interface ListRow extends MessageRow {
  notification_id: string;
  created_at: Date;
  read_at: Date | null;
  version: number;
}

@Injectable()
export class MysqlNotificationRepository extends NotificationRepository {
  private readonly logger = new Logger(MysqlNotificationRepository.name);
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly hook: NotificationAfterCommitHook,
  ) {
    super();
  }

  async publish(
    input: PublishNotification,
    audit: CommandContext,
  ): Promise<PublishNotificationResult> {
    return withTransaction(this.pool, async (db) => {
      // 新空事件不插入；仍检查已有键，不能借空集合绕过一致性判断。
      if (!input.recipientIds.length) {
        const existing = await this.findEvent(db, input.eventKey);
        return existing
          ? this.reuse(db, existing, input)
          : { status: 'no_recipients', notificationId: null };
      }
      let id: string;
      try {
        await db.execute<ResultSetHeader>(
          `INSERT INTO notifications (event_key,event_type,source_type,source_id,target_type,target_id,title,body,created_by)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [
            input.eventKey,
            input.eventType,
            input.sourceType,
            input.sourceId,
            input.targetType,
            input.targetId,
            input.title,
            input.body,
            audit.actorId,
          ],
        );
        // CAST 避免 BIGINT 通过 JS number 丢失精度，不修改全局驱动行为。
        const [[inserted]] = await db.query<(RowDataPacket & { id: string })[]>(
          'SELECT CAST(LAST_INSERT_ID() AS CHAR) id',
        );
        id = inserted!.id;
      } catch (error) {
        if (
          typeof error !== 'object' ||
          error === null ||
          !('code' in error) ||
          error.code !== 'ER_DUP_ENTRY'
        )
          throw error;
        const existing = await this.findEvent(db, input.eventKey);
        if (!existing) throw error;
        return this.reuse(db, existing, input);
      }
      // 用户存在性由 FK 保证；不重查账号启停、角色或业务资格。
      for (const userId of input.recipientIds) {
        await db.execute(
          'INSERT INTO notification_recipients (notification_id,user_id,created_by) VALUES (?,?,?)',
          [id, userId, audit.actorId],
        );
      }
      await this.audit(db, audit, 'notification.publish', id, {
        eventType: input.eventType,
        recipientCount: input.recipientIds.length,
      });
      const event: CommittedNotification = Object.freeze({
        notificationId: id,
        eventKey: input.eventKey,
        eventType: input.eventType,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        targetType: input.targetType,
        targetId: input.targetId,
        recipientIds: Object.freeze([...input.recipientIds]),
        requestId: audit.requestId,
      });
      this.schedule(event);
      return { status: 'created', notificationId: id };
    });
  }

  private schedule(event: CommittedNotification): void {
    // 此作用域没有事务连接、正文或 HTTP 请求，只捕获端口和不可变轻量事件。
    const hook = this.hook;
    const logger = this.logger;
    registerAfterCommit(
      this.pool,
      `notification:${event.notificationId}`,
      () => hook.handle(event),
      () =>
        logger.warn({
          message: '通知提交后钩子失败',
          notificationId: event.notificationId,
          eventType: event.eventType,
          requestId: event.requestId,
        }),
    );
  }

  private async findEvent(db: PoolConnection, key: string): Promise<MessageRow | undefined> {
    // 共享当前读可见并发胜者；消息不可变，无需将重复 INSERT 持有的共享锁升级为排他锁。
    const [[row]] = await db.query<MessageRow[]>(
      `SELECT CAST(id AS CHAR) id,event_type,source_type,CAST(source_id AS CHAR) source_id,
      target_type,CAST(target_id AS CHAR) target_id,title,body FROM notifications WHERE event_key=? FOR SHARE`,
      [key],
    );
    return row;
  }
  private async reuse(
    db: PoolConnection,
    row: MessageRow,
    input: PublishNotification,
  ): Promise<PublishNotificationResult> {
    const [recipients] = await db.query<(RowDataPacket & { user_id: string })[]>(
      'SELECT CAST(user_id AS CHAR) user_id FROM notification_recipients WHERE notification_id=? FOR SHARE',
      [row.id],
    );
    if (
      row.event_type !== input.eventType ||
      row.source_type !== input.sourceType ||
      row.source_id !== input.sourceId ||
      row.target_type !== input.targetType ||
      row.target_id !== input.targetId ||
      row.title !== input.title ||
      row.body !== input.body ||
      JSON.stringify(recipients.map((r) => r.user_id).sort()) !== JSON.stringify(input.recipientIds)
    ) {
      throw new NotificationDomainError(
        'NOTIFICATION_EVENT_CONFLICT',
        '同一通知事件的内容或收件人不一致',
      );
    }
    return { status: 'reused', notificationId: row.id };
  }

  async list(query: NotificationQuery, actorId: string): Promise<PageResult<NotificationItem>> {
    const page = query.page ?? 1,
      pageSize = query.pageSize ?? 10;
    const where = `r.user_id=?${query.read === 'unread' ? ' AND r.read_at IS NULL' : ''}`;
    return withActiveConnection(this.pool, async (db) => {
      const [[count]] = await db.query<(RowDataPacket & { total: number })[]>(
        `SELECT COUNT(*) total FROM notification_recipients r WHERE ${where}`,
        [actorId],
      );
      const [rows] = await db.query<ListRow[]>(
        `SELECT CAST(r.id AS CHAR) id,CAST(n.id AS CHAR) notification_id,n.event_type,n.title,n.body,
        n.target_type,CAST(n.target_id AS CHAR) target_id,r.created_at,r.read_at,r.version
        FROM notification_recipients r JOIN notifications n ON n.id=r.notification_id WHERE ${where}
        ORDER BY r.created_at DESC,r.id DESC LIMIT ? OFFSET ?`,
        [actorId, pageSize, (page - 1) * pageSize],
      );
      return {
        items: rows.map((r) => ({
          id: r.id,
          notificationId: r.notification_id,
          eventType: r.event_type,
          title: r.title,
          body: r.body,
          targetType: r.target_type,
          targetId: r.target_id,
          createdAt: toBeijingISOString(r.created_at),
          readAt: r.read_at ? toBeijingISOString(r.read_at) : null,
          version: r.version,
        })),
        total: Number(count!.total),
        page,
        pageSize,
      };
    });
  }
  async unreadCount(actorId: string): Promise<{ count: number }> {
    return withActiveConnection(this.pool, async (db) => {
      const [[row]] = await db.query<(RowDataPacket & { count: number })[]>(
        'SELECT COUNT(*) count FROM notification_recipients WHERE user_id=? AND read_at IS NULL',
        [actorId],
      );
      return { count: Number(row!.count) };
    });
  }
  async read(id: string, version: number, audit: CommandContext): Promise<NotificationReadResult> {
    return withTransaction(this.pool, async (db) => {
      const [[row]] = await db.query<ReceiptRow[]>(
        'SELECT CAST(id AS CHAR) id,read_at,version FROM notification_recipients WHERE id=? AND user_id=? FOR UPDATE',
        [id, audit.actorId],
      );
      if (!row) throw new NotificationDomainError('NOT_FOUND', '通知不存在或不属于当前用户');
      if (row.read_at) return { id, readAt: toBeijingISOString(row.read_at), version: row.version };
      if (row.version !== version)
        throw new NotificationDomainError('CONCURRENT_MODIFICATION', '通知已变化，请刷新后重试');
      const [result] = await db.execute<ResultSetHeader>(
        'UPDATE notification_recipients SET read_at=NOW(),updated_by=?,version=version+1 WHERE id=? AND user_id=? AND version=? AND read_at IS NULL',
        [audit.actorId, id, audit.actorId, version],
      );
      if (result.affectedRows !== 1)
        throw new NotificationDomainError('CONCURRENT_MODIFICATION', '通知已变化，请刷新后重试');
      const [[updated]] = await db.query<ReceiptRow[]>(
        'SELECT read_at,version FROM notification_recipients WHERE id=? AND user_id=?',
        [id, audit.actorId],
      );
      await this.audit(db, audit, 'notification.read', id, {
        readAt: toBeijingISOString(updated!.read_at!),
      });
      return { id, readAt: toBeijingISOString(updated!.read_at!), version: updated!.version };
    });
  }
  private audit(
    db: PoolConnection,
    context: CommandContext,
    action: string,
    id: string,
    data: Record<string, unknown>,
  ) {
    return writeTransactionalAudit(db, {
      logType: 'business',
      module: 'notification',
      action,
      userId: context.actorId,
      targetId: id,
      targetType: action === 'notification.read' ? 'notification_recipient' : 'notification',
      result: 'success',
      afterData: data,
      requestId: context.requestId,
      ip: context.ip,
      userAgent: context.userAgent,
    });
  }
}
