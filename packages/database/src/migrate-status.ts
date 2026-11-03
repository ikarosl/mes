import { loadWorkspaceEnv } from '@company/config';
import { createDatabasePool } from './index.js';
import { migrationStatus, readMigrations, type MigrationHistoryPolicy } from './migration-utils.js';
import { migrationErrorCode, readMigrationHistory } from './migration-runner.js';

// 状态检查与实际迁移使用同一环境加载入口，避免连接到错误数据库。
loadWorkspaceEnv();
const historyPolicy: MigrationHistoryPolicy = {
  allowHistoryEdits: process.env.NODE_ENV === 'development',
  onHistoryEdit: (message) => console.log(message),
};
if (historyPolicy.allowHistoryEdits) {
  console.log(
    '开发迁移模式：历史差异只作提示；已登记同名 SQL 不重放，文件编辑不会自动应用结构差异，原登记摘要保持不变。',
  );
}
const pool = createDatabasePool();
try {
  const migrations = await readMigrations();
  const applied = new Map(
    (await readMigrationHistory(pool, migrations, historyPolicy)).map((row) => [row.name, row]),
  );
  let invalid = false;
  const currentNames = new Set(migrations.map((migration) => migration.name));
  for (const record of applied.values()) {
    if (record.status === 'applied') continue;
    invalid = true;
    if (!currentNames.has(record.name)) console.log(`${record.status} ${record.name}（历史登记）`);
  }
  // 状态查询只读：任何待执行/未完成记录都返回非零，部署和人工恢复据此停止启动。
  for (const migration of migrations) {
    const record = applied.get(migration.name);
    const status =
      historyPolicy.allowHistoryEdits && record
        ? record.status
        : migrationStatus(record?.checksum, migration.checksum, record?.status);
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
