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
    throw new Error('生产环境不能运行演示数据种子。');
  }
  if (environment.ALLOW_DEMO_SEED !== '1') {
    throw new Error('演示数据种子已禁用；如需显式加载，请设置 ALLOW_DEMO_SEED=1。');
  }
  const password = environment.DEMO_USER_PASSWORD;
  if (!password || password.length < 6) {
    throw new Error('DEMO_USER_PASSWORD 长度必须至少为 6 个字符。');
  }
  return password;
};
