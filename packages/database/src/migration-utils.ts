import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
export const migrationsDir = resolve(currentDir, '../migrations');
export const checksum = (content: string) => createHash('sha256').update(content).digest('hex');

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

export const readMigrations = async () => {
  const names = (await readdir(migrationsDir)).filter((name) => name.endsWith('.up.sql')).sort();
  return Promise.all(
    names.map(async (name) => {
      const sql = await readFile(resolve(migrationsDir, name), 'utf8');
      return { name, sql, checksum: checksum(sql) };
    }),
  );
};
