import { loadWorkspaceEnv } from '../../../packages/config/src/index.js';
import {
  createConnection,
  type Connection,
  type ResultSetHeader,
  type RowDataPacket,
} from '../../../apps/api/node_modules/mysql2/promise.js';
import { randomBytes } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

loadWorkspaceEnv();

const describeMysql = process.env.RUN_MYSQL_INTEGRATION === '1' ? describe : describe.skip;
const MIGRATIONS_DIR = new URL('../../../packages/database/migrations/', import.meta.url);
const TARGET_MIGRATION = '202609140001-notifications';

type ConnectionOptions = {
  host: string;
  port: number;
  user: string;
  password: string;
};

describeMysql('Notification migration (real MySQL)', () => {
  let admin: Connection;
  let options: ConnectionOptions;
  const tempDatabases = new Set<string>();

  beforeAll(async () => {
    const referenceDatabase = required('TEST_DB_NAME');
    if (!/_test$/.test(referenceDatabase) || referenceDatabase === 'easy_mes') {
      throw new Error(
        'notification migration integration tests require a dedicated TEST_DB_NAME ending in _test',
      );
    }

    const host = required('TEST_DB_HOST');
    const port = Number(required('TEST_DB_PORT'));
    if (!Number.isInteger(port) || port <= 0) {
      throw new Error('TEST_DB_PORT must be a positive integer');
    }
    options = {
      host,
      port,
      user: process.env.TEST_DB_ADMIN_USER ?? process.env.TEST_DB_USER ?? required('DB_USER'),
      password:
        process.env.TEST_DB_ADMIN_PASSWORD ??
        process.env.TEST_DB_PASSWORD ??
        required('DB_PASSWORD'),
    };
    // TEST_DB is a safety marker only. Each test uses a fresh temporary *_test database.
    admin = await createConnection({ ...options, multipleStatements: false });
  });

  afterAll(async () => {
    for (const name of tempDatabases) {
      try {
        await admin.query(`DROP DATABASE IF EXISTS \`${name}\``);
      } catch {
        // Best-effort cleanup. A leftover *_test database is safer than a failed teardown.
      }
    }
    await admin?.end();
  });

  it('applies the complete migration chain and supports notification down/up', async () => {
    const tempDb = temporaryDatabaseName('notification_shape');
    const connection = await createTempDatabase(tempDb);
    try {
      await applyMigrations(connection, await upMigrations());
      await expectNotificationSchema(connection, true);

      await runMigration(connection, `${TARGET_MIGRATION}.down.sql`);
      await expectNotificationSchema(connection, false);

      await runMigration(connection, `${TARGET_MIGRATION}.up.sql`);
      await expectNotificationSchema(connection, true);
    } finally {
      await connection.end();
      await dropTempDatabase(tempDb);
    }
  });

  it('rejects a non-empty notification down before dropping either table', async () => {
    const tempDb = temporaryDatabaseName('notification_guard');
    const connection = await createTempDatabase(tempDb);
    try {
      await applyMigrations(connection, await upMigrations());
      const actorId = await insertUser(
        connection,
        `notification-guard-${randomBytes(4).toString('hex')}`,
      );
      const notificationId = await insertNotification(
        connection,
        `notification-guard-${randomBytes(4).toString('hex')}`,
        actorId,
      );
      await insertRecipient(connection, notificationId, actorId, actorId);

      await expect(runMigration(connection, `${TARGET_MIGRATION}.down.sql`)).rejects.toMatchObject({
        code: 'ER_CHECK_CONSTRAINT_VIOLATED',
      });

      // The temporary guard is the first failing statement. Neither permanent table may have
      // been dropped before it rejected the rollback.
      await expectNotificationSchema(connection, true);
      const [[counts]] = await connection.query<
        (RowDataPacket & { messages: number; recipients: number })[]
      >(
        `SELECT
           (SELECT COUNT(*) FROM notifications) messages,
           (SELECT COUNT(*) FROM notification_recipients) recipients`,
      );
      expect(counts).toMatchObject({ messages: 1, recipients: 1 });
    } finally {
      await connection.end();
      await dropTempDatabase(tempDb);
    }
  });

  it('enforces notification foreign keys, uniqueness, and source/target/read checks', async () => {
    const tempDb = temporaryDatabaseName('notification_constraints');
    const connection = await createTempDatabase(tempDb);
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
      expect(receipt).toMatchObject({ updated_by: recipientId, version: 1 });
      expect(receipt?.read_at).toBeTruthy();
    } finally {
      await connection.end();
      await dropTempDatabase(tempDb);
    }
  });

  const createTempDatabase = async (name: string): Promise<Connection> => {
    await admin.query(
      `CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
    );
    tempDatabases.add(name);
    return createConnection({ ...options, database: name, multipleStatements: true });
  };

  const dropTempDatabase = async (name: string): Promise<void> => {
    await admin.query(`DROP DATABASE IF EXISTS \`${name}\``);
    tempDatabases.delete(name);
  };
});

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const temporaryDatabaseName = (prefix: string): string =>
  `${prefix}_${Date.now()}_${randomBytes(4).toString('hex')}_test`;

const applyMigrations = async (connection: Connection, names: string[]): Promise<void> => {
  for (const name of names) {
    try {
      await runMigration(connection, name);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`migration ${name} failed: ${message}`, { cause: error });
    }
  }
};

const runMigration = async (connection: Connection, name: string): Promise<void> => {
  const sql = await readFile(new URL(name, MIGRATIONS_DIR), 'utf8');
  await connection.query(sql);
};

const upMigrations = async (): Promise<string[]> =>
  (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith('.up.sql')).sort();

const tableExists = async (connection: Connection, table: string): Promise<boolean> => {
  const [[row]] = await connection.query<(RowDataPacket & { count: number })[]>(
    `SELECT COUNT(*) count
       FROM information_schema.tables
      WHERE table_schema=DATABASE() AND table_name=?`,
    [table],
  );
  return Number(row?.count ?? 0) === 1;
};

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

const insert = async (
  connection: Connection,
  sql: string,
  values: (string | number | null)[],
): Promise<number> => {
  const [result] = await connection.execute<ResultSetHeader>(sql, values);
  return Number(result.insertId);
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
