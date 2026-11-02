import { loadWorkspaceEnv } from '@company/config';
import { createDatabasePool } from './index.js';
import { migrationStatus, readMigrations } from './migration-utils.js';
import { migrationErrorCode, readMigrationHistory } from './migration-runner.js';

// 状态检查与实际迁移使用同一环境加载入口，避免连接到错误数据库。
loadWorkspaceEnv();
const pool = createDatabasePool();
try {
  const migrations = await readMigrations();
  const applied = new Map(
    (await readMigrationHistory(pool, migrations)).map((row) => [row.name, row]),
  );
  let invalid = false;
  // 状态查询只读：任何待执行/未完成记录都返回非零，部署和人工恢复据此停止启动。
  for (const migration of migrations) {
    const record = applied.get(migration.name);
    const status = migrationStatus(record?.checksum, migration.checksum, record?.status);
    console.log(`${status} ${migration.name}`);
    if (status !== 'applied') invalid = true;
  }
  if (invalid) process.exitCode = 1;
} catch (error) {
  console.error(
    error instanceof Error && !('sql' in error)
      ? error.message
      : `迁移状态查询失败（${migrationErrorCode(error)}）。`,
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
