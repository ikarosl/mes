import { Inject, Injectable, Logger } from '@nestjs/common';
import { registerAfterCommit, withActiveConnection, withTransaction } from '@company/database';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  NotificationItem,
  NotificationQuery,
  NotificationReadAllResult,
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
interface UnreadReceiptRow extends RowDataPacket {
  id: string;
}
interface ListRow extends MessageRow {
  notification_id: string;
  created_at: Date;
  read_at: Date | null;
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
    return withActiveConnection(this.pool, async (db) => {
      const [[count]] = await db.query<(RowDataPacket & { total: number })[]>(
        'SELECT COUNT(*) total FROM notification_recipients WHERE user_id=?',
        [actorId],
      );
      const [rows] = await db.query<ListRow[]>(
        `SELECT CAST(r.id AS CHAR) id,CAST(n.id AS CHAR) notification_id,n.event_type,n.title,n.body,
        n.target_type,CAST(n.target_id AS CHAR) target_id,r.created_at,r.read_at
        FROM notification_recipients r JOIN notifications n ON n.id=r.notification_id WHERE r.user_id=?
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
          isUnread: r.read_at === null,
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
  async readAll(audit: CommandContext): Promise<NotificationReadAllResult> {
    return withTransaction(this.pool, async (db) => {
      // 初始未读 ID 供本次面板展示新消息标记。
      const [receipts] = await db.query<UnreadReceiptRow[]>(
        `SELECT CAST(r.id AS CHAR) id FROM notification_recipients r
         WHERE r.user_id=? AND r.read_at IS NULL ORDER BY r.id`,
        [audit.actorId],
      );
      const unreadIds = receipts.map((receipt) => receipt.id);
      const [result] = await db.execute<ResultSetHeader>(
        `UPDATE notification_recipients SET read_at=NOW(),version=1,updated_by=?
         WHERE user_id=? AND read_at IS NULL`,
        [audit.actorId, audit.actorId],
      );
      const readCount = result.affectedRows;
      if (readCount > 0) {
        await writeTransactionalAudit(db, {
          logType: 'business',
          module: 'notification',
          action: 'notification.read-all',
          userId: audit.actorId,
          targetId: audit.actorId,
          targetType: 'notification_inbox',
          result: 'success',
          afterData: { readCount },
          requestId: audit.requestId,
          ip: audit.ip,
          userAgent: audit.userAgent,
        });
      }
      return { readCount, unreadIds };
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
      targetType: 'notification',
      result: 'success',
      afterData: data,
      requestId: context.requestId,
      ip: context.ip,
      userAgent: context.userAgent,
    });
  }
}
