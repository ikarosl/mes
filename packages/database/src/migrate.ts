import { loadWorkspaceEnv } from '@company/config';
import { createDatabasePool } from './index.js';
import { readMigrations } from './migration-utils.js';
import type { RowDataPacket } from 'mysql2/promise';

// Turbo 会在 packages/database 目录执行任务，因此必须显式加载工作区根目录 .env。
loadWorkspaceEnv();
const pool = createDatabasePool({ multipleStatements: true });
try {
  await pool.query(`CREATE TABLE IF NOT EXISTS _schema_migrations (
    name VARCHAR(255) PRIMARY KEY,
    checksum CHAR(64) NOT NULL,
    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  const [rows] = await pool.query<(RowDataPacket & { name: string; checksum: string })[]>(
    'SELECT name, checksum FROM _schema_migrations',
  );
  const applied = new Map(rows.map((row) => [row.name, row.checksum]));
  for (const migration of await readMigrations()) {
    const existing = applied.get(migration.name);
    if (existing && existing !== migration.checksum)
      throw new Error(`Applied migration changed: ${migration.name}`);
    if (existing) continue;
    const connection = await pool.getConnection();
    try {
      await connection.query(migration.sql);
      await connection.execute('INSERT INTO _schema_migrations (name, checksum) VALUES (?, ?)', [
        migration.name,
        migration.checksum,
      ]);
      console.log(`Applied ${migration.name}`);
    } finally {
      connection.release();
    }
  }
} finally {
  await pool.end();
}
