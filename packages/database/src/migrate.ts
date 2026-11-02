import { loadWorkspaceEnv } from '@company/config';
import { createDatabasePool } from './index.js';
import { readMigrations } from './migration-utils.js';
import { migrationErrorCode, runMigrations } from './migration-runner.js';

// Turbo 会在 packages/database 目录执行任务，因此必须显式加载工作区根目录 .env。
// 服务器使用 Compose 从 api.env 注入的 DB_*，已有进程环境不会被 .env 覆盖。
loadWorkspaceEnv();
const migrations = await readMigrations();
// 只负责运行迁移；停写和备份由 deploy-api.sh 在调用本入口之前完成。
const pool = createDatabasePool({ multipleStatements: true });
try {
  const connection = await pool.getConnection();
  try {
    await runMigrations(connection, migrations, (name) => console.log(`已执行 migration：${name}`));
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
