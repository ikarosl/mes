import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
export const seedsDir = resolve(currentDir, '../seed');

export const readSeeds = async () => {
  const names = (await readdir(seedsDir)).filter((name) => name.endsWith('.sql')).sort();
  return Promise.all(
    names.map(async (name) => ({
      name,
      sql: await readFile(resolve(seedsDir, name), 'utf8'),
    })),
  );
};
