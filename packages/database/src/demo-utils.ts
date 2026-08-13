import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
export const demoDir = resolve(currentDir, '../demo');

export const readDemoSeeds = async () => {
  const names = (await readdir(demoDir)).filter((name) => name.endsWith('.sql')).sort();
  return Promise.all(
    names.map(async (name) => ({
      name,
      sql: await readFile(resolve(demoDir, name), 'utf8'),
    })),
  );
};

export const assertDemoSeedEnabled = (environment: NodeJS.ProcessEnv) => {
  if (environment.NODE_ENV === 'production') {
    throw new Error('Demo seed cannot run when NODE_ENV=production.');
  }
  if (environment.ALLOW_DEMO_SEED !== '1') {
    throw new Error('Demo seed is disabled. Set ALLOW_DEMO_SEED=1 for an explicit demo load.');
  }
  const password = environment.DEMO_USER_PASSWORD;
  if (!password || password.length < 6) {
    throw new Error('DEMO_USER_PASSWORD must contain at least 6 characters.');
  }
  return password;
};
