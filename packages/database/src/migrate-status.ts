import { loadWorkspaceEnv } from '@company/config';
import { createDatabasePool } from './index.js';
import { buildMigrationPlan, readMigrationMode } from './migration-plan.js';
import { readMigrations, schemaMigrationsTableExistsQuery } from './migration-utils.js';
import type { RowDataPacket } from 'mysql2/promise';

// 状态检查与实际迁移使用同一环境加载入口，避免连接到错误数据库。
loadWorkspaceEnv();
const mode = readMigrationMode(process.env.DB_MIGRATION_MODE);
const pool = createDatabasePool();
try {
  // 仅检查迁移记录表是否存在；不读取 information_schema.tables 中不存在的 name 字段。
  const [rows] = await pool.query<RowDataPacket[]>(schemaMigrationsTableExistsQuery);
  const applied = new Map<string, string>();
  if (rows.length) {
    const [migrationRows] = await pool.query<
      (RowDataPacket & { name: string; checksum: string })[]
    >('SELECT name, checksum FROM _schema_migrations');
    migrationRows.forEach((row) => applied.set(row.name, row.checksum));
  }
  let invalid = false;
  const plan = buildMigrationPlan(await readMigrations(), applied, mode);
  for (const migration of plan.status) {
    const alternative = migration.alternative ? ` (${migration.alternative})` : '';
    console.log(`${migration.status} ${migration.name}${alternative}`);
    if (migration.status === 'pending') invalid = true;
  }
  if (invalid) process.exitCode = 1;
} finally {
  await pool.end();
}
