import '../../../apps/api/node_modules/reflect-metadata';
import { randomUUID } from 'node:crypto';
import {
  createPool,
  type Pool,
  type ResultSetHeader,
  type RowDataPacket,
} from '../../../apps/api/node_modules/mysql2/promise.js';
import { loadWorkspaceEnv } from '../../../packages/config/src/index.js';
import {
  NotificationService,
  type NotificationAfterCommitHook,
  type PublishNotification,
} from '../../../apps/api/src/modules/notification/public.js';
import { MysqlNotificationRepository } from '../../../apps/api/src/modules/notification/infrastructure/mysql-notification.repository.js';
import type { CommandContext } from '../../../apps/api/src/common/audit/audit.types.js';

loadWorkspaceEnv();

export const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} for notification integration tests`);
  return value;
};

export const notificationPool = (): Pool => {
  if (
    !/_test$/.test(required('TEST_DB_NAME')) ||
    ['HOST', 'PORT', 'NAME'].some((key) => required(`TEST_DB_${key}`) !== required(`DB_${key}`))
  )
    throw new Error(
      'Notification integration requires matching dedicated *_test database endpoints',
    );
  return createPool({
    host: required('DB_HOST'),
    port: Number(required('DB_PORT')),
    user: required('DB_USER'),
    password: required('DB_PASSWORD'),
    database: required('DB_NAME'),
    timezone: '+08:00',
    charset: 'utf8mb4',
    connectionLimit: 8,
  });
};

export class NotificationFixture {
  readonly token = `notify-${randomUUID()}`;
  readonly userIds: string[] = [];
  constructor(readonly pool: Pool) {}

  async createUser(): Promise<string> {
    const [row] = await this.pool.execute<ResultSetHeader>(
      'INSERT INTO users (username,password_hash,display_name) VALUES (?,?,?)',
      [`${this.token}-${this.userIds.length}`, 'integration-test-hash', '通知测试用户'],
    );
    const id = String(row.insertId);
    this.userIds.push(id);
    return id;
  }

  service(hook: NotificationAfterCommitHook = { handle: () => undefined }): NotificationService {
    return new NotificationService(new MysqlNotificationRepository(this.pool, hook));
  }

  input(
    recipientIds: readonly string[],
    overrides: Partial<PublishNotification> = {},
  ): PublishNotification {
    return {
      eventKey: `${this.token}:${randomUUID()}`,
      eventType: 'system_notice',
      sourceType: null,
      sourceId: null,
      targetType: null,
      targetId: null,
      title: '系统通知',
      body: '纯文本通知内容',
      recipientIds,
      ...overrides,
    };
  }

  context(actorId = this.userIds[0]!): CommandContext {
    return {
      actorId,
      requestId: `${this.token}:${randomUUID()}`,
      ip: '127.0.0.1',
      userAgent: 'notification-integration-test',
    };
  }

  async messages(eventKey: string): Promise<RowDataPacket[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT * FROM notifications WHERE event_key=?',
      [eventKey],
    );
    return rows;
  }

  async auditCount(action: string, targetId: string): Promise<number> {
    const [[row]] = await this.pool.query<(RowDataPacket & { total: number })[]>(
      "SELECT COUNT(*) total FROM operation_logs WHERE module='notification' AND action=? AND target_id=? AND request_id LIKE ?",
      [action, targetId, `${this.token}%`],
    );
    return Number(row!.total);
  }

  async cleanup(): Promise<void> {
    await this.pool.execute(
      'DELETE r FROM notification_recipients r JOIN notifications n ON n.id=r.notification_id WHERE n.event_key LIKE ?',
      [`${this.token}%`],
    );
    await this.pool.execute('DELETE FROM notifications WHERE event_key LIKE ?', [`${this.token}%`]);
    await this.pool.execute('DELETE FROM operation_logs WHERE request_id LIKE ?', [
      `${this.token}%`,
    ]);
    if (this.userIds.length) {
      await this.pool.query('DELETE FROM operation_logs WHERE user_id IN (?)', [this.userIds]);
      await this.pool.query('DELETE FROM users WHERE id IN (?)', [this.userIds]);
    }
  }
}
