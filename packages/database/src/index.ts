import { createPool, type Pool, type PoolConnection } from 'mysql2/promise';

export type DatabasePool = Pool;
export type DatabaseConnection = PoolConnection;

export const createDatabasePool = (options: { multipleStatements?: boolean } = {}) =>
  createPool({
    host: requiredEnv('DB_HOST'),
    port: positiveIntegerEnv('DB_PORT'),
    user: requiredEnv('DB_USER'),
    password: requiredEnv('DB_PASSWORD', true),
    database: requiredEnv('DB_NAME'),
    charset: 'utf8mb4',
    connectionLimit: positiveIntegerEnv('DB_CONNECTION_LIMIT'),
    namedPlaceholders: false,
    multipleStatements: options.multipleStatements ?? false,
  });

export const withTransaction = async <T>(
  pool: Pool,
  work: (connection: PoolConnection) => Promise<T>,
) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const requiredEnv = (name: string, allowEmpty = false) => {
  const value = process.env[name];
  if (value === undefined || (!allowEmpty && value.trim() === '')) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const positiveIntegerEnv = (name: string) => {
  const value = Number(requiredEnv(name));
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
};
