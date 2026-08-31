import { createConnection, type Connection } from 'mysql2/promise';
import { loadWorkspaceEnv } from '@company/config';

/**
 * 开发/测试环境入口：确保 `DB_NAME` 指定的数据库存在。
 *
 * `db:migrate` 与 `db:seed` 只负责 schema 和系统数据，不创建数据库本身；Docker Compose 通过
 * `MYSQL_DATABASE` 自动创建，但连接外部 MySQL 或复用现有实例时不会创建。`db:init` 会先执行
 * 本脚本，再执行 migration/seed/bootstrap-admin。
 */
export const ensureDatabaseExists = async (
  connection: Pick<Connection, 'query'>,
  databaseName: string,
): Promise<void> => {
  const normalized = databaseName.trim();
  if (!normalized) throw new Error('DB_NAME 为必填项');
  await connection.query(
    'CREATE DATABASE IF NOT EXISTS ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci',
    [normalized],
  );
};

const requiredEnv = (name: string, allowEmpty = false): string => {
  const value = process.env[name];
  if (value === undefined || (!allowEmpty && value.trim() === '')) {
    throw new Error(`缺少必填环境变量：${name}`);
  }
  return value;
};

const main = async (): Promise<void> => {
  loadWorkspaceEnv();
  const connection = await createConnection({
    host: requiredEnv('DB_HOST'),
    port: Number(requiredEnv('DB_PORT')),
    user: requiredEnv('DB_USER'),
    password: requiredEnv('DB_PASSWORD', true),
    charset: 'utf8mb4',
  });
  try {
    const databaseName = requiredEnv('DB_NAME');
    await ensureDatabaseExists(connection, databaseName);
    console.log(`数据库 ${databaseName} 已就绪`);
  } finally {
    await connection.end();
  }
};

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
