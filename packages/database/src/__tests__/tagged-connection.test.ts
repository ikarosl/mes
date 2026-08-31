import { describe, expect, it, vi } from 'vitest';
import { DatabaseError, tagConnection, withActiveConnection, withTransaction } from '../index.js';

/** mysql2 网络层错误形态：只有 code，无数字 errno/sqlState/sqlMessage。 */
const mysqlNetworkError = (code: string) => Object.assign(new Error(`${code} failure`), { code });

const fakeConnection = () => ({
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
  execute: vi.fn(),
  query: vi.fn(),
});

describe('tagConnection', () => {
  it('execute 抛 mysql2 网络错误（code=ECONNRESET，无 errno 形态）→ 包装为 DatabaseError，cause 与 code 透传', async () => {
    const rawError = mysqlNetworkError('ECONNRESET');
    const connection = fakeConnection();
    connection.execute.mockRejectedValue(rawError);
    const tagged = tagConnection(connection as never);

    const caught = await tagged.execute('SELECT 1').catch((error) => error);
    expect(caught).toBeInstanceOf(DatabaseError);
    expect((caught as DatabaseError).cause).toBe(rawError);
    expect((caught as DatabaseError).code).toBe('ECONNRESET');
    expect(connection.execute).toHaveBeenCalledWith('SELECT 1');
  });

  it('query 抛网络错误同样包装为 DatabaseError', async () => {
    const rawError = mysqlNetworkError('EPIPE');
    const connection = fakeConnection();
    connection.query.mockRejectedValue(rawError);
    const tagged = tagConnection(connection as never);

    const caught = await tagged.query('SELECT 1').catch((error) => error);
    expect(caught).toBeInstanceOf(DatabaseError);
    expect((caught as DatabaseError).cause).toBe(rawError);
    expect((caught as DatabaseError).code).toBe('EPIPE');
  });

  it('成功调用原样返回结果，不包装', async () => {
    const rows = [[{ id: 1 }], []];
    const connection = fakeConnection();
    connection.execute.mockResolvedValue(rows);
    const tagged = tagConnection(connection as never);

    await expect(tagged.execute('SELECT 1')).resolves.toBe(rows);
    await expect(tagged.query('SELECT 1')).resolves.toBeUndefined();
  });

  it('非查询方法直接绑定透传：commit/release 落在同一底层连接', async () => {
    const connection = fakeConnection();
    const tagged = tagConnection(connection as never);

    await tagged.commit();
    await tagged.release();
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.release).toHaveBeenCalledOnce();
  });

  it('服务器错误形态透传 code/errno/sqlState/sqlMessage getter（按码 catch 不受影响）', async () => {
    const rawError = Object.assign(new Error('Deadlock found when trying to get lock'), {
      code: 'ER_LOCK_DEADLOCK',
      errno: 1213,
      sqlState: '40001',
      sqlMessage: 'Deadlock found when trying to get lock',
    });
    const connection = fakeConnection();
    connection.execute.mockRejectedValue(rawError);
    const tagged = tagConnection(connection as never);

    const caught = await tagged.execute('SELECT 1').catch((error) => error);
    expect(caught.code).toBe('ER_LOCK_DEADLOCK');
    expect(caught.errno).toBe(1213);
    expect(caught.sqlState).toBe('40001');
    expect(caught.sqlMessage).toBe('Deadlock found when trying to get lock');
  });
});

describe('withTransaction 来源标记', () => {
  it('嵌套 withTransaction 拿到的连接是 tagged 的：查询失败包装为 DatabaseError；work 回调原始连接不包装', async () => {
    const rawError = mysqlNetworkError('ETIMEDOUT');
    const connection = fakeConnection();
    connection.execute.mockRejectedValue(rawError);
    const pool = { getConnection: vi.fn().mockResolvedValue(connection) };

    await withTransaction(pool as never, async (outer) => {
      // work 回调收到原始 connection：直接查询失败原样透传，绝不包装
      const rawCaught = await outer.execute('SELECT raw').catch((error) => error);
      expect(rawCaught).toBe(rawError);

      await withTransaction(pool as never, async (inner) => {
        // 嵌套路径拿到的 tagged 门面：查询失败包装为 DatabaseError 且 cause 保留原错误
        const caught = await inner.execute('SELECT tagged').catch((error) => error);
        expect(caught).toBeInstanceOf(DatabaseError);
        expect((caught as DatabaseError).cause).toBe(rawError);
        expect((caught as DatabaseError).code).toBe('ETIMEDOUT');
      });
    });
  });

  it('withActiveConnection 在事务内拿到 tagged 连接', async () => {
    const rawError = mysqlNetworkError('ECONNRESET');
    const connection = fakeConnection();
    connection.query.mockRejectedValue(rawError);
    const pool = { getConnection: vi.fn().mockResolvedValue(connection) };

    await withTransaction(pool as never, async () =>
      withActiveConnection(pool as never, async (queryable) => {
        const caught = await (queryable as { query: (s: string) => Promise<unknown> })
          .query('SELECT 1')
          .catch((error) => error);
        expect(caught).toBeInstanceOf(DatabaseError);
        expect((caught as DatabaseError).cause).toBe(rawError);
        expect((caught as DatabaseError).code).toBe('ECONNRESET');
      }),
    );
  });

  it('work 回调内非 SQL 抛错不被包装，原样透传', async () => {
    const connection = fakeConnection();
    const pool = { getConnection: vi.fn().mockResolvedValue(connection) };
    const businessError = new Error('业务异常');

    await expect(
      withTransaction(pool as never, async () => {
        throw businessError;
      }),
    ).rejects.toBe(businessError);
  });
});

describe('withTransaction rollback 失败日志', () => {
  it('只记录异常类型与白名单 code，绝不打印原始消息（含业务错误与 rollback 错误两边）', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const rollbackError = Object.assign(new Error('rollback failed: password=secret BEGIN'), {
        code: 'ECONNRESET',
      });
      const businessError = Object.assign(new Error('业务错误含参数 username=admin'), {
        code: 'ER_DUP_ENTRY',
      });
      const connection = fakeConnection();
      connection.rollback.mockRejectedValue(rollbackError);
      const pool = { getConnection: vi.fn().mockResolvedValue(connection) };

      await expect(
        withTransaction(pool as never, async () => {
          throw businessError;
        }),
      ).rejects.toBe(businessError);

      const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
      expect(output).not.toContain('password=secret');
      expect(output).not.toContain('username=admin');
      expect(output).toContain('原始异常类型：Error');
      expect(output).toContain('回滚异常类型：Error');
      expect(output).toContain('ECONNRESET'); // 网络错误码白名单内，可记录
      expect(output).toContain('ER_DUP_ENTRY'); // 服务器错误码形态白名单内，可记录
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it('白名单外 code 一律不打印', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const rollbackError = Object.assign(new Error('weird'), { code: 'SOMETHING_CUSTOM_123' });
      const connection = fakeConnection();
      connection.rollback.mockRejectedValue(rollbackError);
      const pool = { getConnection: vi.fn().mockResolvedValue(connection) };

      await expect(
        withTransaction(pool as never, async () => {
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');

      const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
      expect(output).not.toContain('SOMETHING_CUSTOM_123');
      expect(output).not.toContain('weird');
      expect(output).not.toContain('boom');
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it('非 Error 抛值也只记录类型，不打印内容', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const rollbackError = mysqlNetworkError('ETIMEDOUT');
      const connection = fakeConnection();
      connection.rollback.mockRejectedValue(rollbackError);
      const pool = { getConnection: vi.fn().mockResolvedValue(connection) };

      await expect(
        withTransaction(pool as never, async () => {
          throw 'credential-string-value';
        }),
      ).rejects.toBe('credential-string-value');

      const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
      expect(output).not.toContain('credential-string-value');
      expect(output).toContain('原始异常类型：string');
    } finally {
      consoleSpy.mockRestore();
    }
  });
});
