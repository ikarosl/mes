import { loadWorkspaceEnv } from '@company/config';
import { createDatabasePool } from './index.js';
import { readMigrations, schemaMigrationsTableExistsQuery } from './migration-utils.js';
import type { RowDataPacket } from 'mysql2/promise';

// 状态检查与实际迁移使用同一环境加载入口，避免连接到错误数据库。
loadWorkspaceEnv();
const pool = createDatabasePool();
try {
  // 仅检查迁移记录表是否存在；不读取 information_schema.tables 中不存在的 name 字段。
  const [rows] = await pool.query<RowDataPacket[]>(schemaMigrationsTableExistsQuery);
  const applied = new Set<string>();
  if (rows.length) {
    const [migrationRows] = await pool.query<(RowDataPacket & { name: string })[]>(
      'SELECT name FROM _schema_migrations',
    );
    migrationRows.forEach((row) => applied.add(row.name));
  }
  for (const migration of await readMigrations())
    console.log(`${applied.has(migration.name) ? 'applied' : 'pending'} ${migration.name}`);
} finally {
  await pool.end();
}
