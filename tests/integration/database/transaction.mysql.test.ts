import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createPool, type RowDataPacket } from '../../../apps/api/node_modules/mysql2/promise.js';
import { loadWorkspaceEnv } from '../../../packages/config/src/index.js';
import { withTransaction } from '../../../packages/database/dist/index.js';

loadWorkspaceEnv();
const describeMysql = process.env.RUN_MYSQL_INTEGRATION === '1' ? describe : describe.skip;

describeMysql('Shared transaction connection recycling (real MySQL)', () => {
  it('discards a healthy connection after rollback failure without leaking uncommitted data', async () => {
    if (
      !/^.+_test$/.test(process.env.TEST_DB_NAME ?? '') ||
      ['HOST', 'PORT', 'NAME'].some(
        (key) =>
          !process.env[`TEST_DB_${key}`] ||
          process.env[`TEST_DB_${key}`] !== process.env[`DB_${key}`],
      )
    )
      throw new Error(
        'Transaction integration requires matching dedicated *_test database endpoints',
      );

    const pool = createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      connectionLimit: 1,
    });
    const table = `transaction_pool_${randomUUID().replaceAll('-', '')}`;
    const originalError = new Error('work failed');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    let failedConnectionId: number | undefined;
    let rollbackError: unknown;
    let connectionStillHealthy = false;

    try {
      await pool.query(`CREATE TABLE ${table} (id INT PRIMARY KEY) ENGINE=InnoDB`);
      await expect(
        withTransaction(pool, async (connection) => {
          failedConnectionId = connection.threadId;
          await connection.query(`INSERT INTO ${table} (id) VALUES (1)`);
          // 服务端拒绝回滚命令，但连接仍健康且事务未结束，覆盖驱动不会主动淘汰连接的情形。
          vi.spyOn(connection, 'rollback').mockImplementationOnce(async () => {
            try {
              await connection.query('ROLLBACK TO SAVEPOINT missing_transaction_savepoint');
            } catch (error) {
              rollbackError = error;
              const [rows] = await connection.query<RowDataPacket[]>(`SELECT id FROM ${table}`);
              connectionStillHealthy = rows.length === 1 && rows[0]!.id === 1;
              throw error;
            }
          });
          throw originalError;
        }),
      ).rejects.toBe(originalError);

      expect(rollbackError).toMatchObject({ code: 'ER_SP_DOES_NOT_EXIST' });
      expect(connectionStillHealthy).toBe(true);
      const next = await pool.getConnection();
      try {
        expect(next.threadId).not.toBe(failedConnectionId);
        const [rows] = await next.query<RowDataPacket[]>(`SELECT id FROM ${table}`);
        expect(rows).toEqual([]);
      } finally {
        next.release();
      }
      await withTransaction(pool, async (connection) => {
        await connection.query(`INSERT INTO ${table} (id) VALUES (2)`);
      });
      const [committed] = await pool.query<RowDataPacket[]>(`SELECT id FROM ${table}`);
      expect(committed.map((row) => row.id)).toEqual([2]);
    } finally {
      log.mockRestore();
      try {
        await pool.query(`DROP TABLE IF EXISTS ${table}`);
      } finally {
        await pool.end();
      }
    }
  });
});
