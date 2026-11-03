import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
export const migrationsDir = resolve(currentDir, '../migrations');
export const checksum = (content: string) => createHash('sha256').update(content).digest('hex');

export interface Migration {
  name: string;
  sql: string;
  checksum: string;
}

export interface MigrationHistoryPolicy {
  allowHistoryEdits?: boolean;
  onHistoryEdit?: (message: string) => void;
}

/**
 * 执行与状态查询共用的历史完整性检查。
 * 默认拒绝历史文件缺失或改写；开发入口可显式允许差异，但不改写登记或重新执行同名 SQL。
 */
export const assertAppliedMigrations = (
  migrations: readonly Migration[],
  applied: ReadonlyMap<string, string>,
  policy: MigrationHistoryPolicy = {},
): void => {
  const byName = new Map(migrations.map((migration) => [migration.name, migration]));
  for (const [name, appliedChecksum] of applied) {
    const migration = byName.get(name);
    if (!migration) {
      if (policy.allowHistoryEdits) {
        policy.onHistoryEdit?.(`开发历史提示：${name} 已不在当前文件集，原登记继续保留。`);
        continue;
      }
      throw new Error(
        `数据库含当前注册表不存在的 migration：${name}。旧基线数据库须按初始化手册重建；不得删除登记后强行迁移。`,
      );
    }
    if (migration.checksum !== appliedChecksum) {
      if (policy.allowHistoryEdits) {
        policy.onHistoryEdit?.(
          `开发历史提示：${name} 当前内容与登记摘要不同，保留原摘要且不重放。`,
        );
        continue;
      }
      throw new Error(`已执行的 migration 内容发生变化：${name}`);
    }
  }
};

export const migrationLockName = 'easy_mes_migration';
export const acquireMigrationLockQuery = 'SELECT GET_LOCK(?, ?) acquired';
export const releaseMigrationLockQuery = 'SELECT RELEASE_LOCK(?) released';

export type MigrationExecutionStatus = 'running' | 'applied' | 'failed';
export type MigrationStatus = MigrationExecutionStatus | 'pending' | 'checksum-mismatch';
export const migrationStatus = (
  appliedChecksum: string | undefined,
  expectedChecksum: string,
  executionStatus: MigrationExecutionStatus = 'applied',
): MigrationStatus => {
  if (!appliedChecksum) return 'pending';
  return appliedChecksum === expectedChecksum ? executionStatus : 'checksum-mismatch';
};

export const readMigrations = async (): Promise<Migration[]> => {
  // 文件名前缀决定全项目顺序；只读取 up，down 不是失败时自动运行的补偿脚本。
  const names = (await readdir(migrationsDir)).filter((name) => name.endsWith('.up.sql')).sort();
  return Promise.all(
    names.map(async (name) => {
      const sql = await readFile(resolve(migrationsDir, name), 'utf8');
      return { name, sql, checksum: checksum(sql) };
    }),
  );
};
