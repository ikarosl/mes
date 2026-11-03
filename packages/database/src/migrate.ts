import { loadWorkspaceEnv } from '@company/config';
import { createDatabasePool } from './index.js';
import { readMigrations, type MigrationHistoryPolicy } from './migration-utils.js';
import { migrationErrorCode, runMigrations } from './migration-runner.js';
import { createDevelopmentBackup } from './development-backup.js';

// Turbo 会在 packages/database 目录执行任务，因此必须显式加载工作区根目录 .env。
// 服务器使用 Compose 从 api.env 注入的 DB_*，已有进程环境不会被 .env 覆盖。
loadWorkspaceEnv();
const historyPolicy: MigrationHistoryPolicy = {
  allowHistoryEdits: process.env.NODE_ENV === 'development',
  onHistoryEdit: (message) => console.log(message),
};
if (historyPolicy.allowHistoryEdits) {
  console.log(
    '开发迁移模式：允许整理历史文件；已登记同名 SQL 不重放，编辑带来的结构差异须由整改者同步落库，原登记与摘要保持不变。',
  );
}
const migrations = await readMigrations();
// 生产备份由 deploy-api.sh 完成；开发备份在持锁回调中执行，业务停写由调用者负责。
const pool = createDatabasePool({ multipleStatements: true });
try {
  const connection = await pool.getConnection();
  try {
    await runMigrations(
      connection,
      migrations,
      (name) => console.log(`已执行 migration：${name}`),
      historyPolicy,
      historyPolicy.allowHistoryEdits
        ? async () => {
            const backup = await createDevelopmentBackup(connection);
            console.log(`开发数据库备份完成：${backup}；回退时手动将 DB_NAME 改为该库并重启 API。`);
          }
        : undefined,
    );
  } finally {
    // 不把执行过 DDL 的专用会话放回连接池；断开也会释放其 MySQL 建议锁。
    connection.destroy();
  }
} catch (error) {
  // mysql2 错误对象可能包含完整 SQL，不向部署日志输出底层对象。
  console.error(
    error instanceof Error && !('sql' in error)
      ? error.message
      : `迁移命令失败（${migrationErrorCode(error)}），请保持停写并检查数据库。`,
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
