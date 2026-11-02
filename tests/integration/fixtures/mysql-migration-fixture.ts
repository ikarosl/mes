import {
  createConnection,
  type Connection,
  type RowDataPacket,
} from '../../../apps/api/node_modules/mysql2/promise.js';
import { readdir, readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

export const MIGRATIONS_DIR = new URL('../../../packages/database/migrations/', import.meta.url);

export type ConnectionOptions = {
  host: string;
  port: number;
  user: string;
  password: string;
};

export const applyMigrations = async (connection: Connection, names: string[]): Promise<void> => {
  for (const name of names) {
    const sql = await readFile(new URL(name, MIGRATIONS_DIR), 'utf8');
    try {
      await connection.query(sql);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`migration ${name} failed: ${message}`, { cause: error });
    }
  }
};

export const upMigrations = async (): Promise<string[]> => {
  const names = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith('.up.sql')).sort();
  return names;
};

export const tableExists = async (connection: Connection, table: string): Promise<boolean> => {
  const [[row]] = await connection.query<(RowDataPacket & { count: number })[]>(
    `SELECT COUNT(*) count FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=?`,
    [table],
  );
  return Number(row?.count ?? 0) === 1;
};

export const insert = async (
  connection: Connection,
  sql: string,
  values: unknown[],
): Promise<number> => {
  const [result] = await connection.execute(sql, values as never);
  return Number((result as { insertId: number }).insertId);
};

export const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

export const createMigrationSandbox = async () => {
  const database = required('TEST_DB_NAME');
  const host = required('TEST_DB_HOST');
  const port = Number(required('TEST_DB_PORT'));
  if (
    !/^[a-zA-Z0-9_]+_test$/.test(database) ||
    process.env.DB_NAME !== database ||
    process.env.DB_HOST !== host ||
    Number(process.env.DB_PORT) !== port ||
    !Number.isInteger(port) ||
    port <= 0
  ) {
    throw new Error(
      'Migration tests require matching DB_*/TEST_DB_* and a dedicated *_test database',
    );
  }
  const options: ConnectionOptions = {
    host,
    port,
    user: process.env.TEST_DB_ADMIN_USER ?? process.env.TEST_DB_USER ?? required('DB_USER'),
    password:
      process.env.TEST_DB_ADMIN_PASSWORD ?? process.env.TEST_DB_PASSWORD ?? required('DB_PASSWORD'),
  };
  const admin = await createConnection(options);
  const databases = new Set<string>();
  const connections = new Set<Connection>();

  const close = async (connection: Connection, name: string): Promise<void> => {
    try {
      await connection.end();
    } finally {
      connections.delete(connection);
      if (databases.has(name)) {
        await admin.query(`DROP DATABASE IF EXISTS \`${name}\``);
        databases.delete(name);
      }
    }
  };
  return {
    options,
    async create(prefix: string): Promise<{ connection: Connection; database: string }> {
      const name = `${prefix.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 24)}_${randomBytes(8).toString('hex')}_test`;
      await admin.query(
        `CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
      );
      databases.add(name);
      const connection = await createConnection({
        ...options,
        database: name,
        multipleStatements: true,
        charset: 'utf8mb4',
        timezone: '+08:00',
      });
      connections.add(connection);
      await connection.query("SET time_zone = '+08:00'");
      return { connection, database: name };
    },
    close,
    async dispose(): Promise<void> {
      try {
        for (const connection of connections) await connection.end();
        for (const name of databases) await admin.query(`DROP DATABASE IF EXISTS \`${name}\``);
      } finally {
        await admin.end();
      }
    },
  };
};

export type MigrationSandbox = Awaited<ReturnType<typeof createMigrationSandbox>>;

export const baselineMigrations = async (
  owner: string,
  direction: 'up' | 'down',
  phase?: 'tables' | 'foreign-keys' | 'triggers',
): Promise<string[]> => {
  const names = (await upMigrations()).filter((name) =>
    phase
      ? name.endsWith(`-baseline-${owner}-${phase}.up.sql`)
      : ['tables', 'foreign-keys', 'triggers'].some((value) =>
          name.endsWith(`-baseline-${owner}-${value}.up.sql`),
        ),
  );
  if (names.length === 0)
    throw new Error(`Missing baseline migrations for ${owner}/${phase ?? 'all'}`);
  return direction === 'up'
    ? names
    : names.reverse().map((name) => name.replace(/\.up\.sql$/, '.down.sql'));
};
