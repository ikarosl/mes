import { loadWorkspaceEnv } from '@company/config';
import { createDatabasePool } from './index.js';
import {
  acquireMigrationLockQuery,
  migrationLockName,
  readMigrations,
  releaseMigrationLockQuery,
} from './migration-utils.js';
import type { RowDataPacket } from 'mysql2/promise';

// Turbo 会在 packages/database 目录执行任务，因此必须显式加载工作区根目录 .env。
loadWorkspaceEnv();
const pool = createDatabasePool({ multipleStatements: true });
try {
  const connection = await pool.getConnection();
  try {
    const [[lock]] = await connection.query<(RowDataPacket & { acquired: number | null })[]>(
      acquireMigrationLockQuery,
      [migrationLockName, 30],
    );
    if (lock?.acquired !== 1) throw new Error('Could not acquire migration advisory lock');
    try {
      await connection.query(`CREATE TABLE IF NOT EXISTS _schema_migrations (
    name VARCHAR(255) PRIMARY KEY,
    checksum CHAR(64) NOT NULL,
    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      const [rows] = await connection.query<(RowDataPacket & { name: string; checksum: string })[]>(
        'SELECT name, checksum FROM _schema_migrations',
      );
      const applied = new Map(rows.map((row) => [row.name, row.checksum]));
      for (const migration of await readMigrations()) {
        const existing = applied.get(migration.name);
        if (existing && existing !== migration.checksum)
          throw new Error(`Applied migration changed: ${migration.name}`);
        if (existing) continue;
        await connection.query(migration.sql);
        await connection.execute('INSERT INTO _schema_migrations (name, checksum) VALUES (?, ?)', [
          migration.name,
          migration.checksum,
        ]);
        console.log(`Applied ${migration.name}`);
      }
    } finally {
      await connection.query(releaseMigrationLockQuery, [migrationLockName]);
    }
  } finally {
    connection.release();
  }
} finally {
  await pool.end();
}
