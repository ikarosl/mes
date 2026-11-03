import type { Connection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import {
  acquireMigrationLockQuery,
  assertAppliedMigrations,
  migrationLockName,
  releaseMigrationLockQuery,
  type Migration,
  type MigrationExecutionStatus,
  type MigrationHistoryPolicy,
} from './migration-utils.js';

type MigrationConnection = Pick<Connection, 'query' | 'execute'>;

export interface MigrationRecord {
  name: string;
  checksum: string;
  status: MigrationExecutionStatus;
  error_code: string | null;
}

const createHistoryQuery = `CREATE TABLE _schema_migrations (
  name VARCHAR(255) PRIMARY KEY,
  checksum CHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'running',
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applied_at DATETIME NULL,
  error_code VARCHAR(64) NULL,
  CONSTRAINT chk_schema_migrations_status CHECK (status IN ('running', 'applied', 'failed')),
  CONSTRAINT chk_schema_migrations_completion CHECK (
    (status = 'applied' AND applied_at IS NOT NULL) OR
    (status <> 'applied' AND applied_at IS NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`;

const hasMigrationHistory = async (connection: MigrationConnection): Promise<boolean> => {
  const [tables] = await connection.query<(RowDataPacket & { name: string })[]>(
    'SELECT TABLE_NAME name FROM information_schema.tables WHERE table_schema = DATABASE()',
  );
  const exists = tables.some((table) => table.name === '_schema_migrations');
  if (!exists && tables.length)
    throw new Error('数据库非空且缺少迁移登记，拒绝初始化；请核对目标库，勿补造迁移记录。');
  return exists;
};

/** 只读核验；旧基线和不完整登记均不能被解释成空库。 */
export const readMigrationHistory = async (
  connection: MigrationConnection,
  migrations: readonly Migration[],
  policy: MigrationHistoryPolicy = {},
): Promise<MigrationRecord[]> => {
  if (!(await hasMigrationHistory(connection))) return [];
  const [identities] = await connection.query<
    (RowDataPacket & { name: string; checksum: string })[]
  >('SELECT name, checksum FROM _schema_migrations ORDER BY name');
  assertAppliedMigrations(
    migrations,
    new Map(identities.map((row) => [row.name, row.checksum])),
    policy,
  );
  if (identities.length === 0) {
    const [unregistered] = await connection.query<RowDataPacket[]>(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name <> '_schema_migrations' LIMIT 1`,
    );
    if (unregistered.length)
      throw new Error('迁移登记为空但数据库已有其他表，拒绝初始化；请核对目标库及恢复来源。');
  }
  const [columns] = await connection.query<(RowDataPacket & { name: string })[]>(
    `SELECT COLUMN_NAME name FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = '_schema_migrations'`,
  );
  for (const required of ['status', 'started_at', 'applied_at', 'error_code']) {
    if (!columns.some((column) => column.name === required))
      throw new Error('旧迁移登记结构不支持当前基线；请按初始化手册重建，不自动修改旧库。');
  }
  const [rows] = await connection.query<
    (RowDataPacket & MigrationRecord & { started_at: Date | null; applied_at: Date | null })[]
  >(
    'SELECT name, checksum, status, error_code, started_at, applied_at FROM _schema_migrations ORDER BY name',
  );
  const records = rows.map((row): MigrationRecord => {
    if (
      typeof row.name !== 'string' ||
      !row.name.trim() ||
      typeof row.checksum !== 'string' ||
      !/^[0-9a-f]{64}$/i.test(row.checksum) ||
      !['running', 'applied', 'failed'].includes(row.status) ||
      !row.started_at ||
      (row.status === 'applied' ? !row.applied_at : row.applied_at !== null)
    ) {
      throw new Error('迁移登记不完整或包含非法状态，拒绝执行；请核对账本和恢复来源。');
    }
    return {
      name: row.name,
      checksum: row.checksum,
      status: row.status,
      error_code: row.error_code,
    };
  });
  const names = new Set(records.map((row) => row.name));
  let missingPredecessor = false;
  for (const migration of migrations) {
    if (!names.has(migration.name)) missingPredecessor = true;
    else if (missingPredecessor) {
      if (policy.allowHistoryEdits) {
        policy.onHistoryEdit?.(
          '开发历史提示：当前文件顺序与历史登记存在缺口，仅执行当前未登记的文件。',
        );
        break;
      }
      throw new Error(
        `迁移登记存在顺序缺口：${migration.name}。请核对恢复来源，禁止跳过前置迁移。`,
      );
    }
  }
  return records;
};

export const migrationErrorCode = (error: unknown): string => {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = error.code;
    if (typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(code)) return code;
  }
  return 'MIGRATION_ERROR';
};

/**
 * 先持久化 running 再执行 DDL。崩溃/连接中断也会留下阻止自动重跑的记录；
 * 这不是 DDL 回滚机制，恢复必须回到经验证的备份或新空库。
 */
export const runMigrations = async (
  connection: MigrationConnection,
  migrations: readonly Migration[],
  onApplied: (name: string) => void = () => undefined,
  policy: MigrationHistoryPolicy = {},
  beforeMigrate?: () => Promise<void>,
): Promise<void> => {
  // 数据库建议锁只串行化迁移进程；业务停写仍由外层维护流程负责。
  const [[lock]] = await connection.query<(RowDataPacket & { acquired: number | null })[]>(
    acquireMigrationLockQuery,
    [migrationLockName, 30],
  );
  if (lock?.acquired !== 1) throw new Error('无法获取迁移 advisory 锁');
  let releaseError: unknown;
  try {
    // 开发历史编辑策略不豁免未完成或非法登记；全部核验在任何新 SQL 之前完成。
    const records = await readMigrationHistory(connection, migrations, policy);
    const unfinished = records.find((record) => record.status !== 'applied');
    if (unfinished)
      throw new Error(
        `迁移 ${unfinished.name} 状态为 ${unfinished.status}，禁止自动重跑。保持停写，按迁移恢复手册核对或恢复备份。`,
      );
    const applied = new Set(records.map((row) => row.name));
    await beforeMigrate?.();
    if (!(await hasMigrationHistory(connection))) await connection.query(createHistoryQuery);
    for (const migration of migrations) {
      if (applied.has(migration.name)) continue;
      // DDL 前先落库登记；即使之后进程崩溃，下次也能识别这次尚未确认的执行。
      await connection.execute(
        "INSERT INTO _schema_migrations (name, checksum, status) VALUES (?, ?, 'running')",
        [migration.name, migration.checksum],
      );
      try {
        // 整份 SQL 不是一个可回滚事务；只有全部成功且登记更新成功才算 applied。
        await connection.query(migration.sql);
        const [result] = await connection.execute<ResultSetHeader>(
          "UPDATE _schema_migrations SET status='applied', applied_at=CURRENT_TIMESTAMP WHERE name=? AND status='running'",
          [migration.name],
        );
        if (result.affectedRows !== 1)
          throw new Error('迁移完成登记未更新，需核对数据库实际状态。');
      } catch (error) {
        // 只记录安全错误码并立即停止；不执行 down，也不重放可能已部分成功的 SQL。
        const code = migrationErrorCode(error);
        try {
          await connection.execute(
            "UPDATE _schema_migrations SET status='failed', error_code=? WHERE name=? AND status='running'",
            [code, migration.name],
          );
        } catch {
          // 连接已断开时保留 running；下一次执行同样拒绝，不掩盖原始失败。
        }
        throw new Error(
          `迁移失败：${migration.name}（${code}）。数据库可能已部分变更，未自动回滚；保持停写并按恢复手册处理。`,
          { cause: error },
        );
      }
      onApplied(migration.name);
    }
  } finally {
    try {
      await connection.query(releaseMigrationLockQuery, [migrationLockName]);
    } catch (error) {
      // 失败连接会由命令入口销毁；释放锁异常不能覆盖迁移失败的定位信息。
      releaseError = error;
    }
  }
  if (releaseError !== undefined)
    throw new Error('迁移执行完成，但释放迁移锁失败；请核对连接及迁移状态。', {
      cause: releaseError,
    });
};
