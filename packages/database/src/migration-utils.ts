import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
export const migrationsDir = resolve(currentDir, '../migrations');
export const checksum = (content: string) => createHash('sha256').update(content).digest('hex');

export const readMigrations = async () => {
  const names = (await readdir(migrationsDir)).filter((name) => name.endsWith('.up.sql')).sort();
  return Promise.all(
    names.map(async (name) => {
      const sql = await readFile(resolve(migrationsDir, name), 'utf8');
      return { name, sql, checksum: checksum(sql) };
    }),
  );
};
