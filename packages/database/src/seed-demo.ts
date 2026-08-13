import { loadWorkspaceEnv } from '@company/config';
import bcrypt from 'bcryptjs';
import { assertDemoSeedEnabled, readDemoSeeds } from './demo-utils.js';
import { createDatabasePool, withTransaction } from './index.js';

loadWorkspaceEnv();
const demoPassword = assertDemoSeedEnabled(process.env);
const passwordHash = await bcrypt.hash(demoPassword, 12);
const pool = createDatabasePool({ multipleStatements: true });

try {
  await withTransaction(pool, async (connection) => {
    await connection.query('SET @demo_password_hash = ?', [passwordHash]);
    for (const seed of await readDemoSeeds()) {
      await connection.query(seed.sql);
      console.log(`Applied demo seed ${seed.name}`);
    }
  });
} finally {
  await pool.end();
}
