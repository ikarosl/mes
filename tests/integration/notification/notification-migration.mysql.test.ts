import { loadWorkspaceEnv } from '../../../packages/config/src/index.js';
import type { Connection, RowDataPacket } from '../../../apps/api/node_modules/mysql2/promise.js';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type MigrationSandbox,
  applyMigrations,
  baselineMigrations,
  createMigrationSandbox,
  insert,
  tableExists,
  upMigrations,
} from '../fixtures/mysql-migration-fixture.js';
import { captureSchemaSnapshot } from '../fixtures/mysql-schema-snapshot.js';

loadWorkspaceEnv();
const describeMysql = process.env.RUN_MYSQL_INTEGRATION === '1' ? describe : describe.skip;

describeMysql('Notification baseline (real MySQL)', () => {
  let sandbox: MigrationSandbox;
  beforeAll(async () => {
    sandbox = await createMigrationSandbox();
  });
  afterAll(async () => {
    await sandbox?.dispose();
  });

  it('supports empty notification down/up with all columns, indexes and constraints restored', async () => {
    const { database, connection } = await sandbox.create('notification_shape');
    try {
      await applyMigrations(connection, await upMigrations());
      await expectNotificationSchema(connection, true);
      const before = await captureSchemaSnapshot(connection);
      await applyMigrations(connection, await baselineMigrations('notification', 'down'));
      await expectNotificationSchema(connection, false);
      await applyMigrations(connection, await baselineMigrations('notification', 'up'));
      await expectNotificationSchema(connection, true);
      expect(await captureSchemaSnapshot(connection)).toEqual(before);
    } finally {
      await sandbox.close(connection, database);
    }
  });

  it('rejects each notification down phase before DDL and preserves messages and recipients', async () => {
    const { database, connection } = await sandbox.create('notification_guard');
    try {
      await applyMigrations(connection, await upMigrations());
      const actorId = await insertUser(
        connection,
        `notification-guard-${randomBytes(4).toString('hex')}`,
      );
      const notificationId = await insertNotification(
        connection,
        `event-${randomBytes(4).toString('hex')}`,
        actorId,
      );
      await insertRecipient(connection, notificationId, actorId, actorId);
      const before = await captureSchemaSnapshot(connection);
      for (const name of await baselineMigrations('notification', 'down')) {
        await expect(applyMigrations(connection, [name])).rejects.toMatchObject({
          cause: { code: 'ER_CHECK_CONSTRAINT_VIOLATED' },
        });
        expect(await captureSchemaSnapshot(connection)).toEqual(before);
      }
      const [[counts]] = await connection.query<RowDataPacket[]>(
        'SELECT (SELECT COUNT(*) FROM notifications) messages,(SELECT COUNT(*) FROM notification_recipients) recipients',
      );
      expect(Number(counts?.messages)).toBe(1);
      expect(Number(counts?.recipients)).toBe(1);
    } finally {
      await sandbox.close(connection, database);
    }
  });

  it('enforces notification foreign keys, uniqueness, and source/target/read checks', async () => {
    const { database, connection } = await sandbox.create('notification_constraints');
    try {
      await applyMigrations(connection, await upMigrations());
      const actorId = await insertUser(
        connection,
        `notification-constraints-actor-${randomBytes(4).toString('hex')}`,
      );
      const recipientId = await insertUser(
        connection,
        `notification-constraints-recipient-${randomBytes(4).toString('hex')}`,
      );
      const token = `notification-constraints-${randomBytes(4).toString('hex')}`;

      await expect(
        insertNotification(connection, `${token}-missing-creator`, '999999999999'),
      ).rejects.toMatchObject({ code: 'ER_NO_REFERENCED_ROW_2' });

      await expect(
        connection.execute(
          `INSERT INTO notifications
             (event_key,event_type,source_type,source_id,target_type,target_id,title,body,created_by)
           VALUES (?, 'system_notice', 'approval_action', NULL, NULL, NULL, '标题', '正文', ?)`,
          [`${token}-missing-source-id`, actorId],
        ),
      ).rejects.toMatchObject({ code: 'ER_CHECK_CONSTRAINT_VIOLATED' });

      await expect(
        connection.execute(
          `INSERT INTO notifications
             (event_key,event_type,source_type,source_id,target_type,target_id,title,body,created_by)
           VALUES (?, 'system_notice', NULL, NULL, 'approval_instance', NULL, '标题', '正文', ?)`,
          [`${token}-missing-target-id`, actorId],
        ),
      ).rejects.toMatchObject({ code: 'ER_CHECK_CONSTRAINT_VIOLATED' });

      const notificationId = await insertNotification(connection, `${token}-event`, actorId);
      await expect(insertNotification(connection, `${token}-event`, actorId)).rejects.toMatchObject(
        { code: 'ER_DUP_ENTRY' },
      );

      const receiptId = await insertRecipient(connection, notificationId, recipientId, actorId);
      await expect(
        insertRecipient(connection, notificationId, recipientId, actorId),
      ).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
      await expect(
        insertRecipient(connection, '999999999999', recipientId, actorId),
      ).rejects.toMatchObject({ code: 'ER_NO_REFERENCED_ROW_2' });
      await expect(
        insertRecipient(connection, notificationId, '999999999999', actorId),
      ).rejects.toMatchObject({ code: 'ER_NO_REFERENCED_ROW_2' });

      // version=1 without a read timestamp/updater violates the unread/read invariant.
      await expect(
        connection.execute('UPDATE notification_recipients SET version=1 WHERE id=?', [receiptId]),
      ).rejects.toMatchObject({ code: 'ER_CHECK_CONSTRAINT_VIOLATED' });
      await expect(
        connection.execute(
          'UPDATE notification_recipients SET read_at=NOW(), updated_by=?, version=1 WHERE id=?',
          [recipientId, receiptId],
        ),
      ).resolves.toBeDefined();
      await expect(
        connection.execute(
          'UPDATE notification_recipients SET user_id=?, updated_by=? WHERE id=?',
          ['999999999999', '999999999999', receiptId],
        ),
      ).rejects.toMatchObject({ code: 'ER_NO_REFERENCED_ROW_2' });

      const [[receipt]] = await connection.query<
        (RowDataPacket & { read_at: Date; updated_by: number; version: number })[]
      >('SELECT read_at,updated_by,version FROM notification_recipients WHERE id=?', [receiptId]);
      expect(Number(receipt?.updated_by)).toBe(recipientId);
      expect(receipt?.version).toBe(1);
      expect(receipt?.read_at).toBeTruthy();
    } finally {
      await sandbox.close(connection, database);
    }
  });
});

const constraintExists = async (
  connection: Connection,
  table: string,
  constraint: string,
): Promise<boolean> => {
  const [[row]] = await connection.query<(RowDataPacket & { count: number })[]>(
    `SELECT COUNT(*) count
       FROM information_schema.table_constraints
      WHERE constraint_schema=DATABASE() AND table_name=? AND constraint_name=?`,
    [table, constraint],
  );
  return Number(row?.count ?? 0) === 1;
};

const expectNotificationSchema = async (connection: Connection, exists: boolean): Promise<void> => {
  expect(await tableExists(connection, 'notifications')).toBe(exists);
  expect(await tableExists(connection, 'notification_recipients')).toBe(exists);
  if (!exists) return;

  expect(await constraintExists(connection, 'notifications', 'uk_notifications_event')).toBe(true);
  expect(await constraintExists(connection, 'notifications', 'fk_notifications_creator')).toBe(
    true,
  );
  expect(
    await constraintExists(
      connection,
      'notification_recipients',
      'uk_notification_recipients_user',
    ),
  ).toBe(true);
  expect(
    await constraintExists(
      connection,
      'notification_recipients',
      'chk_notification_recipients_read',
    ),
  ).toBe(true);
};

const insertUser = async (connection: Connection, username: string): Promise<number> =>
  insert(connection, 'INSERT INTO users (username,password_hash,display_name) VALUES (?,?,?)', [
    username,
    'notification-migration-test-only',
    '通知迁移测试用户',
  ]);

const insertNotification = async (
  connection: Connection,
  eventKey: string,
  actorId: number | string,
): Promise<number> =>
  insert(
    connection,
    `INSERT INTO notifications
       (event_key,event_type,source_type,source_id,target_type,target_id,title,body,created_by)
     VALUES (?, 'system_notice', NULL, NULL, NULL, NULL, '标题', '正文', ?)`,
    [eventKey, actorId],
  );

const insertRecipient = async (
  connection: Connection,
  notificationId: number | string,
  userId: number | string,
  createdBy: number | string,
): Promise<number> =>
  insert(
    connection,
    'INSERT INTO notification_recipients (notification_id,user_id,created_by) VALUES (?,?,?)',
    [notificationId, userId, createdBy],
  );
