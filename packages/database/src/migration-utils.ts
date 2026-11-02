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

/**
 * 执行与状态查询共用的历史完整性检查。
 * 先核对全部已登记文件及其校验和，避免执行部分待迁移 SQL 后才发现历史文件缺失或被修改。
 */
export const assertAppliedMigrations = (
  migrations: readonly Migration[],
  applied: ReadonlyMap<string, string>,
): void => {
  const byName = new Map(migrations.map((migration) => [migration.name, migration]));
  for (const [name, appliedChecksum] of applied) {
    const migration = byName.get(name);
    if (!migration)
      throw new Error(
        `数据库含当前注册表不存在的 migration：${name}。旧基线数据库须按初始化手册重建；不得删除登记后强行迁移。`,
      );
    if (migration.checksum !== appliedChecksum)
      throw new Error(`已执行的 migration 内容发生变化：${name}`);
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
