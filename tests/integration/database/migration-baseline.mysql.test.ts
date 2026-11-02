import { loadWorkspaceEnv } from '../../../packages/config/src/index.js';
import type { RowDataPacket } from '../../../apps/api/node_modules/mysql2/promise.js';
import { runMigrations } from '../../../packages/database/src/migration-runner.js';
import { readMigrations, type Migration } from '../../../packages/database/src/migration-utils.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type MigrationSandbox,
  applyMigrations,
  createMigrationSandbox,
  insert,
} from '../fixtures/mysql-migration-fixture.js';
import {
  capturePermissionCatalog,
  captureSchemaSnapshot,
  type SchemaSnapshot,
} from '../fixtures/mysql-schema-snapshot.js';

loadWorkspaceEnv();
const describeMysql = process.env.RUN_MYSQL_INTEGRATION === '1' ? describe : describe.skip;

describeMysql('Modular migration baseline (real MySQL)', () => {
  let sandbox: MigrationSandbox;
  let registry: Migration[];
  let baseline: string[];
  beforeAll(async () => {
    registry = await readMigrations();
    baseline = registry
      .map((migration) => migration.name)
      .filter((name) => /^20261102\d{4}-baseline-.*\.up\.sql$/.test(name));
    expect(baseline, 'The fixed 20261102 baseline must exist').not.toHaveLength(0);
    sandbox = await createMigrationSandbox();
  });
  afterAll(async () => {
    await sandbox?.dispose();
  });

  it('applies the current full registry once and leaves schema, catalog and history unchanged on repeat', async () => {
    const { connection, database } = await sandbox.create('baseline_fresh_repeat');
    try {
      await runMigrations(connection, registry);
      const before = await captureSchemaSnapshot(connection);
      const catalogBefore = await capturePermissionCatalog(connection);
      const [historyBefore] = await connection.query<RowDataPacket[]>(
        'SELECT * FROM _schema_migrations ORDER BY name',
      );
      expect(before.tables).not.toHaveLength(0);
      expect(catalogBefore).not.toHaveLength(0);
      expect(historyBefore.map((record) => record.name)).toEqual(
        registry.map((migration) => migration.name),
      );
      expect(
        historyBefore.every(
          (record) =>
            record.status === 'applied' &&
            record.started_at &&
            record.applied_at &&
            record.error_code === null,
        ),
      ).toBe(true);
      await runMigrations(connection, registry);
      const [historyAfter] = await connection.query<RowDataPacket[]>(
        'SELECT * FROM _schema_migrations ORDER BY name',
      );
      expect(historyAfter).toEqual(historyBefore);
      expect(await captureSchemaSnapshot(connection)).toEqual(before);
      expect(await capturePermissionCatalog(connection)).toEqual(catalogBefore);
    } finally {
      await sandbox.close(connection, database);
    }
  });

  it('round-trips the whole empty baseline down/up without disabling foreign keys or leaving indexes or triggers', async () => {
    const { connection, database } = await sandbox.create('baseline_roundtrip');
    try {
      await applyMigrations(connection, baseline);
      const before = await captureSchemaSnapshot(connection);
      const catalogBefore = await capturePermissionCatalog(connection);
      for (const name of [...baseline].reverse()) {
        await applyMigrations(connection, [name.replace(/\.up\.sql$/, '.down.sql')]);
        const [[setting]] = await connection.query<RowDataPacket[]>(
          'SELECT @@foreign_key_checks enabled',
        );
        expect(Number(setting?.enabled)).toBe(1);
      }
      const empty = await captureSchemaSnapshot(connection);
      for (const key of Object.keys(empty) as (keyof SchemaSnapshot)[]) {
        if (key !== 'schema') expect(empty[key], key).toEqual([]);
      }
      await applyMigrations(connection, baseline);
      expect(await captureSchemaSnapshot(connection)).toEqual(before);
      expect(await capturePermissionCatalog(connection)).toEqual(catalogBefore);
    } finally {
      await sandbox.close(connection, database);
    }
  });

  it('rejects every cross-module protection down phase before DDL when any business row exists', async () => {
    const { connection, database } = await sandbox.create('baseline_nonempty');
    try {
      await applyMigrations(connection, baseline);
      const actorId = await insert(
        connection,
        'INSERT INTO users (username,password_hash,display_name) VALUES (?,?,?)',
        ['baseline-guard', 'test-only', 'Baseline guard actor'],
      );
      const before = await captureSchemaSnapshot(connection);
      const catalogBefore = await capturePermissionCatalog(connection);
      for (const name of baseline.filter((name) => !name.endsWith('-tables.up.sql')).reverse()) {
        const down = name.replace(/\.up\.sql$/, '.down.sql');
        await expect(applyMigrations(connection, [down])).rejects.toMatchObject({
          cause: { code: 'ER_CHECK_CONSTRAINT_VIOLATED' },
        });
        expect(await captureSchemaSnapshot(connection), down).toEqual(before);
        expect(await capturePermissionCatalog(connection), down).toEqual(catalogBefore);
      }
      const [[actor]] = await connection.query<RowDataPacket[]>('SELECT id FROM users WHERE id=?', [
        actorId,
      ]);
      expect(Number(actor?.id)).toBe(actorId);
    } finally {
      await sandbox.close(connection, database);
    }
  });

  it.each([
    {
      table: 'users',
      row: {
        username: 'baseline-table-guard',
        password_hash: 'test-only',
        display_name: 'Baseline table guard',
      },
    },
    {
      table: 'permissions',
      row: { code: 'baseline:guard', name: 'Baseline guard permission', type: 'menu' },
    },
  ])(
    'rejects identity table down while only $table rows remain before foreign keys exist',
    async ({ table, row }) => {
      const tables = baseline.filter((name) => name.endsWith('-baseline-identity-tables.up.sql'));
      expect(tables).toHaveLength(1);
      const { connection, database } = await sandbox.create('baseline_table_guard');
      try {
        // Only phase 1 is installed, so a foreign key cannot mask a missing data guard.
        await applyMigrations(connection, tables);
        await connection.query('INSERT INTO ?? SET ?', [table, row]);
        const before = await captureSchemaSnapshot(connection);
        expect(before.foreignKeys).toEqual([]);
        const [rowsBefore] = await connection.query<RowDataPacket[]>('SELECT ?? FROM ??', [
          Object.keys(row),
          table,
        ]);
        expect(rowsBefore).toHaveLength(1);
        const downs = tables.map((name) => name.replace(/\.up\.sql$/, '.down.sql'));
        await expect(applyMigrations(connection, downs)).rejects.toMatchObject({
          cause: { code: 'ER_CHECK_CONSTRAINT_VIOLATED' },
        });
        expect(await captureSchemaSnapshot(connection)).toEqual(before);
        const [rowsAfter] = await connection.query<RowDataPacket[]>('SELECT ?? FROM ??', [
          Object.keys(row),
          table,
        ]);
        expect(rowsAfter).toEqual(rowsBefore);
      } finally {
        await sandbox.close(connection, database);
      }
    },
  );
});
