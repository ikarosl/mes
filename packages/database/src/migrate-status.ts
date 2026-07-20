import './load-env.js';
import { createDatabasePool } from './index.js';
import { readMigrations } from './migration-utils.js';
import type { RowDataPacket } from 'mysql2/promise';

const pool = createDatabasePool();
try {
  const [rows] = await pool.query<(RowDataPacket & { name: string })[]>(
    "SELECT name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = '_schema_migrations'",
  );
  const applied = new Set<string>();
  if (rows.length) {
    const [migrationRows] = await pool.query<(RowDataPacket & { name: string })[]>(
      'SELECT name FROM _schema_migrations',
    );
    migrationRows.forEach((row) => applied.add(row.name));
  }
  for (const migration of await readMigrations())
    console.log(`${applied.has(migration.name) ? 'applied' : 'pending'} ${migration.name}`);
} finally {
  await pool.end();
}
