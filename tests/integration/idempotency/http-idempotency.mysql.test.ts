import { loadWorkspaceEnv } from '../../../packages/config/src/index.js';
import {
  createPool,
  type ExecuteValues,
  type Pool,
  type PoolConnection,
  type ResultSetHeader,
  type RowDataPacket,
} from '../../../apps/api/node_modules/mysql2/promise.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTransaction } from '../../../packages/database/src/index.js';
import type { IdempotentCommand } from '../../../apps/api/src/common/idempotency/idempotency-executor.js';
import { MysqlIdempotencyExecutor } from '../../../apps/api/src/infrastructure/idempotency/mysql-idempotency.executor.js';

loadWorkspaceEnv();

const describeMysql = process.env.RUN_MYSQL_INTEGRATION === '1' ? describe : describe.skip;

describeMysql('HTTP idempotency executor (real MySQL)', () => {
  let pool: Pool;
  let executor: MysqlIdempotencyExecutor;
  let actorId: number;
  let scope: string;

  const SCRATCH_TABLE = '_idem_test_write';

  beforeAll(async () => {
    pool = createPool({
      host: requiredEnv('DB_HOST'),
      port: Number(requiredEnv('DB_PORT')),
      user: requiredEnv('DB_USER'),
      password: requiredEnv('DB_PASSWORD'),
      database: requiredEnv('DB_NAME'),
      charset: 'utf8mb4',
      timezone: '+08:00',
      connectionLimit: 4,
    });
    await pool.execute(
      `CREATE TABLE IF NOT EXISTS ${SCRATCH_TABLE} (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        value VARCHAR(64) NOT NULL
      ) ENGINE=InnoDB`,
    );
    const token = `idem-test-${process.pid}-${Math.floor(Math.random() * 1_000_000)}`;
    actorId = await insert(
      pool,
      'INSERT INTO users (username,password_hash,display_name) VALUES (?,?,?)',
      [`${token}-actor`, 'hash', 'Idempotency test actor'],
    );
    scope = 'integration.test.write.v1';
    executor = new MysqlIdempotencyExecutor(pool as never);
  });

  afterAll(async () => {
    if (pool) {
      await pool.execute(`DROP TABLE IF EXISTS ${SCRATCH_TABLE}`);
      await pool.execute('DELETE FROM http_idempotency_records WHERE actor_id=?', [actorId]);
      await pool.execute('DELETE FROM users WHERE id=?', [actorId]);
      await pool.end();
    }
  });

  const writeHandler = (value: string) => async () => {
    const result = await withTransaction(pool, async (connection: PoolConnection) => {
      const [r] = await connection.execute<ResultSetHeader>(
        `INSERT INTO ${SCRATCH_TABLE} (value) VALUES (?)`,
        [value],
      );
      return r;
    });
    return { id: String(result.insertId), value };
  };

  const makeCommand = (
    key: string,
    body: unknown,
    handler: () => Promise<{ id: string; value: string }>,
  ): IdempotentCommand<{ id: string; value: string }> => ({
    scope,
    key,
    actorId: String(actorId),
    requestId: 'req-idem-integration',
    request: { params: {}, body },
    resultCodec: {
      encode: (result) => result,
      decode: (stored: unknown) => {
        if (
          typeof stored !== 'object' ||
          stored === null ||
          !('id' in stored) ||
          typeof stored.id !== 'string'
        ) {
          throw new Error('invalid stored result');
        }
        return stored as { id: string; value: string };
      },
    },
    handler,
  });

  const scratchCount = async (): Promise<number> => {
    const [[row]] = await pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total FROM ${SCRATCH_TABLE}`,
    );
    return Number(row.total);
  };

  const recordCount = async (key: string): Promise<number> => {
    const [[row]] = await pool.query<(RowDataPacket & { total: number })[]>(
      'SELECT COUNT(*) total FROM http_idempotency_records WHERE scope=? AND idempotency_key=?',
      [scope, key],
    );
    return Number(row.total);
  };

  it('提交成功但响应丢失后重试：返回原结果，不重复业务写入', async () => {
    const key = `retry-${process.pid}`;
    const first = await executor.execute(makeCommand(key, { n: 1 }, writeHandler('retry-1')));
    expect(first.isReplay).toBe(false);

    const retry = await executor.execute(makeCommand(key, { n: 1 }, writeHandler('retry-2')));
    expect(retry.isReplay).toBe(true);
    expect(retry.result).toEqual(first.result);
    expect(await scratchCount()).toBe(1);
  });

  it('同键两个并发事务：只产生一次业务写入，两个调用得到同一结果且一个标记重放', async () => {
    const key = `concurrent-${process.pid}`;
    const before = await scratchCount();

    const [a, b] = await Promise.all([
      executor.execute(makeCommand(key, { n: 1 }, writeHandler('concurrent-1'))),
      executor.execute(makeCommand(key, { n: 1 }, writeHandler('concurrent-2'))),
    ]);

    expect(a.result).toEqual(b.result);
    expect(a.isReplay).not.toBe(b.isReplay);
    expect(await scratchCount()).toBe(before + 1);
    expect(await recordCount(key)).toBe(1);
  });

  it('首次事务业务失败整体回滚：不留记录不留写入，下一次同键可正常执行', async () => {
    const key = `rollback-${process.pid}`;
    const failingHandler = async () => {
      await withTransaction(pool, async (connection: PoolConnection) => {
        await connection.execute(`INSERT INTO ${SCRATCH_TABLE} (value) VALUES (?)`, ['rollback']);
      });
      throw new Error('business failure');
    };
    await expect(executor.execute(makeCommand(key, { n: 1 }, failingHandler))).rejects.toThrow(
      'business failure',
    );
    expect(await scratchCount()).toBe(0);
    expect(await recordCount(key)).toBe(0);

    const retry = await executor.execute(makeCommand(key, { n: 1 }, writeHandler('rollback-ok')));
    expect(retry.isReplay).toBe(false);
    expect(await scratchCount()).toBe(1);
  });

  it('同键不同指纹：稳定返回 IDEMPOTENCY_CONFLICT，不执行 handler', async () => {
    const key = `conflict-${process.pid}`;
    await executor.execute(makeCommand(key, { n: 1 }, writeHandler('conflict-1')));

    const conflicting = viFailingHandler();
    await expect(executor.execute(makeCommand(key, { n: 2 }, conflicting))).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    expect(await scratchCount()).toBe(1);
  });

  it('到期但未物理清理仍重放；物理删除后同键按新请求处理', async () => {
    const key = `expiry-${process.pid}`;
    await executor.execute(makeCommand(key, { n: 1 }, writeHandler('expiry-1')));
    await pool.execute(
      'UPDATE http_idempotency_records SET expires_at = DATE_SUB(NOW(), INTERVAL 1 DAY) WHERE scope=? AND idempotency_key=?',
      [scope, key],
    );

    const expiredReplay = await executor.execute(
      makeCommand(key, { n: 1 }, writeHandler('expiry-2')),
    );
    expect(expiredReplay.isReplay).toBe(true);
    expect(await scratchCount()).toBe(1);

    await pool.execute('DELETE FROM http_idempotency_records WHERE scope=? AND idempotency_key=?', [
      scope,
      key,
    ]);
    const fresh = await executor.execute(makeCommand(key, { n: 1 }, writeHandler('expiry-fresh')));
    expect(fresh.isReplay).toBe(false);
    expect(await scratchCount()).toBe(2);
  });
});

const viFailingHandler = () => async () => {
  throw new Error('must not execute');
};

const insert = async (pool: Pool, sql: string, values: ExecuteValues[]) => {
  const [result] = await pool.execute<ResultSetHeader>(sql, values);
  return Number(result.insertId);
};

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} for MySQL integration test`);
  return value;
};
