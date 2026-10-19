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
    if (!migration) throw new Error(`数据库含当前注册表不存在的 migration：${name}`);
    if (migration.checksum !== appliedChecksum)
      throw new Error(`已执行的 migration 内容发生变化：${name}`);
  }
};

/**
 * 检查当前数据库是否已创建迁移记录表。
 * 这里只需要存在性结果；`information_schema.tables` 没有 `name` 字段，因此使用常量查询。
 */
export const schemaMigrationsTableExistsQuery = `
  SELECT 1
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = '_schema_migrations'
  LIMIT 1
`;

export const migrationLockName = 'easy_mes_migration';
export const acquireMigrationLockQuery = 'SELECT GET_LOCK(?, ?) acquired';
export const releaseMigrationLockQuery = 'SELECT RELEASE_LOCK(?) released';

export type MigrationStatus = 'applied' | 'pending' | 'checksum-mismatch';
export const migrationStatus = (
  appliedChecksum: string | undefined,
  expectedChecksum: string,
): MigrationStatus => {
  if (!appliedChecksum) return 'pending';
  return appliedChecksum === expectedChecksum ? 'applied' : 'checksum-mismatch';
};

export const readMigrations = async (): Promise<Migration[]> => {
  const names = (await readdir(migrationsDir)).filter((name) => name.endsWith('.up.sql')).sort();
  return Promise.all(
    names.map(async (name) => {
      const sql = await readFile(resolve(migrationsDir, name), 'utf8');
      return { name, sql, checksum: checksum(sql) };
    }),
  );
};
