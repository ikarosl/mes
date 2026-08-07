import { loadWorkspaceEnv } from '@company/config';
import { createDatabasePool, withTransaction } from './index.js';
import { readSeeds } from './seed-utils.js';

// Turbo 会在 packages/database 目录执行任务，因此必须显式加载工作区根目录 .env。
loadWorkspaceEnv();
const pool = createDatabasePool({ multipleStatements: true });
try {
  await withTransaction(pool, async (connection) => {
    for (const seed of await readSeeds()) {
      await connection.query(seed.sql);
      console.log(`Applied seed ${seed.name}`);
    }
  });
} finally {
  await pool.end();
}
