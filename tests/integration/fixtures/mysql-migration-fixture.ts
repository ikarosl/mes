import {
  type Connection,
  type RowDataPacket,
} from '../../../apps/api/node_modules/mysql2/promise.js';
import { readdir, readFile } from 'node:fs/promises';

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
