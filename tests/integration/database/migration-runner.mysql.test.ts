import { loadWorkspaceEnv } from '../../../packages/config/src/index.js';
import {
  runMigrations,
  readMigrationHistory,
} from '../../../packages/database/src/migration-runner.js';
import { checksum, type Migration } from '../../../packages/database/src/migration-utils.js';
import {
  createConnection,
  type Connection,
  type RowDataPacket,
} from '../../../apps/api/node_modules/mysql2/promise.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type MigrationSandbox,
  createMigrationSandbox,
  tableExists,
} from '../fixtures/mysql-migration-fixture.js';
import { captureSchemaSnapshot } from '../fixtures/mysql-schema-snapshot.js';

loadWorkspaceEnv();
const describeMysql = process.env.RUN_MYSQL_INTEGRATION === '1' ? describe : describe.skip;
const migration = (name: string, sql: string): Migration => ({
  name,
  sql,
  checksum: checksum(sql),
});
const first = migration(
  '202611020001-fixture-first.up.sql',
  'CREATE TABLE fixture_first (id INT PRIMARY KEY) ENGINE=InnoDB',
);
const second = migration(
  '202611020002-fixture-second.up.sql',
  'CREATE TABLE fixture_second (id INT PRIMARY KEY) ENGINE=InnoDB',
);

describeMysql('Persistent migration execution history (real MySQL)', () => {
  let sandbox: MigrationSandbox;
  beforeAll(async () => {
    sandbox = await createMigrationSandbox();
  });
  afterAll(async () => {
    await sandbox?.dispose();
  });

  const withinDatabase = async (
    prefix: string,
    run: (connection: Connection) => Promise<void>,
  ): Promise<void> => {
    const { connection, database } = await sandbox.create(prefix);
    try {
      await run(connection);
    } finally {
      await sandbox.close(connection, database);
    }
  };

  it('creates an empty ledger and does not execute applied DDL again on repeated initialization', async () => {
    await withinDatabase('runner_repeated', async (connection) => {
      expect(await readMigrationHistory(connection, [first, second])).toEqual([]);
      expect(await tableExists(connection, '_schema_migrations')).toBe(false);
      const applied: string[] = [];
      await runMigrations(connection, [first, second], (name) => applied.push(name));
      const [before] = await connection.query<RowDataPacket[]>(
        'SELECT * FROM _schema_migrations ORDER BY name',
      );
      expect(before.map((row) => row.status)).toEqual(['applied', 'applied']);
      expect(
        before.every((row) => row.started_at && row.applied_at && row.error_code === null),
      ).toBe(true);
      await runMigrations(connection, [first, second], (name) => applied.push(name));
      const [after] = await connection.query<RowDataPacket[]>(
        'SELECT * FROM _schema_migrations ORDER BY name',
      );
      expect(after).toEqual(before);
      expect(applied).toEqual([first.name, second.name]);
    });
  });

  it('retains successful DDL, persists failed, stops later migrations and rejects automatic retry', async () => {
    await withinDatabase('runner_partial_failure', async (connection) => {
      const failing = migration(
        '202611020002-fixture-partial.up.sql',
        'CREATE TABLE fixture_partial (id INT PRIMARY KEY) ENGINE=InnoDB; INSERT INTO fixture_missing (id) VALUES (1)',
      );
      const later = migration(
        '202611020003-fixture-later.up.sql',
        'CREATE TABLE fixture_later (id INT PRIMARY KEY) ENGINE=InnoDB',
      );
      const registry = [first, failing, later];
      await expect(runMigrations(connection, registry)).rejects.toThrow(/ER_NO_SUCH_TABLE/);
      expect(await tableExists(connection, 'fixture_first')).toBe(true);
      expect(await tableExists(connection, 'fixture_partial')).toBe(true);
      expect(await tableExists(connection, 'fixture_later')).toBe(false);
      expect(await readMigrationHistory(connection, registry)).toEqual([
        { name: first.name, checksum: first.checksum, status: 'applied', error_code: null },
        {
          name: failing.name,
          checksum: failing.checksum,
          status: 'failed',
          error_code: 'ER_NO_SUCH_TABLE',
        },
      ]);
      const before = await captureSchemaSnapshot(connection);
      await expect(runMigrations(connection, registry)).rejects.toThrow(/failed.*禁止自动重跑/);
      expect(await captureSchemaSnapshot(connection)).toEqual(before);
      expect(await tableExists(connection, 'fixture_later')).toBe(false);
    });
  });

  it('serializes two runners so the same fresh DDL and registration execute once', async () => {
    const { connection, database } = await sandbox.create('runner_concurrent');
    const concurrent = await createConnection({
      ...sandbox.options,
      database,
      multipleStatements: true,
    });
    const locked = migration(
      '202611020001-fixture-lock.up.sql',
      'CREATE TABLE fixture_lock (id INT PRIMARY KEY) ENGINE=InnoDB; DO SLEEP(0.15); INSERT INTO fixture_lock VALUES (1)',
    );
    const applied: string[] = [];
    try {
      await Promise.all([
        runMigrations(connection, [locked], (name) => applied.push(name)),
        runMigrations(concurrent, [locked], (name) => applied.push(name)),
      ]);
      expect(applied).toEqual([locked.name]);
      expect(await readMigrationHistory(connection, [locked])).toEqual([
        { name: locked.name, checksum: locked.checksum, status: 'applied', error_code: null },
      ]);
      const [rows] = await connection.query<RowDataPacket[]>('SELECT id FROM fixture_lock');
      expect(rows).toEqual([{ id: 1 }]);
    } finally {
      await concurrent.end();
      await sandbox.close(connection, database);
    }
  });

  it('refuses a persistent running marker left by an interrupted process', async () => {
    await withinDatabase('runner_interrupted', async (connection) => {
      await runMigrations(connection, [first]);
      await connection.execute(
        "INSERT INTO _schema_migrations (name,checksum,status) VALUES (?,?,'running')",
        [second.name, second.checksum],
      );
      await expect(runMigrations(connection, [first, second])).rejects.toThrow(
        /running.*禁止自动重跑/,
      );
      expect(await tableExists(connection, 'fixture_second')).toBe(false);
      expect((await readMigrationHistory(connection, [first, second])).at(-1)?.status).toBe(
        'running',
      );
    });
  });

  it('refuses a nonempty database without history without creating a replacement ledger', async () => {
    await withinDatabase('runner_missing_history', async (connection) => {
      await connection.query(
        'CREATE TABLE existing_business_data (id INT PRIMARY KEY) ENGINE=InnoDB',
      );
      await connection.query('INSERT INTO existing_business_data VALUES (1)');
      await expect(readMigrationHistory(connection, [first])).rejects.toThrow(
        /数据库非空且缺少迁移登记/,
      );
      await expect(runMigrations(connection, [first])).rejects.toThrow(/数据库非空且缺少迁移登记/);
      expect(await tableExists(connection, '_schema_migrations')).toBe(false);
      expect(await tableExists(connection, 'fixture_first')).toBe(false);
      const [[row]] = await connection.query<RowDataPacket[]>(
        'SELECT id FROM existing_business_data',
      );
      expect(row?.id).toBe(1);
    });
  });

  it('refuses an empty existing ledger accompanied by business tables', async () => {
    await withinDatabase('runner_empty_ledger', async (connection) => {
      await runMigrations(connection, []);
      await connection.query(
        'CREATE TABLE existing_business_data (id INT PRIMARY KEY) ENGINE=InnoDB',
      );
      await connection.query('INSERT INTO existing_business_data VALUES (1)');
      await expect(readMigrationHistory(connection, [first])).rejects.toThrow(/非空|业务表|登记/);
      await expect(runMigrations(connection, [first])).rejects.toThrow(/非空|业务表|登记/);
      expect(await tableExists(connection, 'fixture_first')).toBe(false);
      const [records] = await connection.query<RowDataPacket[]>(
        'SELECT name FROM _schema_migrations',
      );
      expect(records).toEqual([]);
      const [rows] = await connection.query<RowDataPacket[]>(
        'SELECT id FROM existing_business_data',
      );
      expect(rows).toEqual([{ id: 1 }]);
    });
  });

  it.each(['retired-entry', 'legacy-shape'] as const)(
    'refuses %s history before changing its structure',
    async (mode) => {
      await withinDatabase('runner_retired_history', async (connection) => {
        await connection.query(
          'CREATE TABLE _schema_migrations (name VARCHAR(255) PRIMARY KEY,checksum CHAR(64) NOT NULL,applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB',
        );
        const row =
          mode === 'retired-entry'
            ? { name: '202607200001-rbac-auth.up.sql', checksum: 'a'.repeat(64) }
            : first;
        await connection.execute('INSERT INTO _schema_migrations (name,checksum) VALUES (?,?)', [
          row.name,
          row.checksum,
        ]);
        const expected =
          mode === 'retired-entry'
            ? /旧基线数据库须按初始化手册重建/
            : /旧迁移登记结构不支持当前基线/;
        await expect(readMigrationHistory(connection, [first])).rejects.toThrow(expected);
        await expect(runMigrations(connection, [first])).rejects.toThrow(expected);
        const [columns] = await connection.query<RowDataPacket[]>(
          'SHOW COLUMNS FROM _schema_migrations',
        );
        expect(columns.map((column) => column.Field)).toEqual(['name', 'checksum', 'applied_at']);
        expect(await tableExists(connection, 'fixture_first')).toBe(false);
      });
    },
  );

  it('rejects checksum tampering before any later DDL executes', async () => {
    await withinDatabase('runner_checksum', async (connection) => {
      await runMigrations(connection, [first]);
      await connection.execute('UPDATE _schema_migrations SET checksum=? WHERE name=?', [
        'f'.repeat(64),
        first.name,
      ]);
      await expect(runMigrations(connection, [first, second])).rejects.toThrow(
        /已执行的 migration 内容发生变化/,
      );
      expect(await tableExists(connection, 'fixture_second')).toBe(false);
    });
  });

  it('rejects a missing predecessor rather than treating it as a pending upgrade', async () => {
    await withinDatabase('runner_history_gap', async (connection) => {
      await runMigrations(connection, [first, second]);
      await connection.execute('DELETE FROM _schema_migrations WHERE name=?', [first.name]);
      await expect(readMigrationHistory(connection, [first, second])).rejects.toThrow(
        /迁移登记存在顺序缺口/,
      );
      await expect(runMigrations(connection, [first, second])).rejects.toThrow(
        /迁移登记存在顺序缺口/,
      );
    });
  });
});
