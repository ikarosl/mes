import { loadWorkspaceEnv } from '@company/config';
import { createDatabasePool } from './index.js';
import { buildMigrationPlan } from './migration-plan.js';
import { readMigrations, schemaMigrationsTableExistsQuery } from './migration-utils.js';
import type { RowDataPacket } from 'mysql2/promise';

// 状态检查与实际迁移使用同一环境加载入口，避免连接到错误数据库。
loadWorkspaceEnv();
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
  const plan = buildMigrationPlan(await readMigrations(), applied);
  for (const migration of plan.status) {
    console.log(`${migration.status} ${migration.name}`);
    if (migration.status === 'pending') invalid = true;
  }
  if (invalid) process.exitCode = 1;
} finally {
  await pool.end();
}
