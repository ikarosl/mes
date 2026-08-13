import { describe, expect, it, vi } from 'vitest';
import { withActiveConnection, withTransaction } from '../index.js';

describe('withTransaction', () => {
  it('commits successful work and releases the connection', async () => {
    const connection = transactionConnection();
    const pool = { getConnection: vi.fn().mockResolvedValue(connection) };

    await expect(withTransaction(pool as never, async (current) => current)).resolves.toBe(
      connection,
    );

    expect(connection.beginTransaction).toHaveBeenCalledOnce();
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledOnce();
  });

  it('rolls back and releases the connection when work fails', async () => {
    const connection = transactionConnection();
    const pool = { getConnection: vi.fn().mockResolvedValue(connection) };

    await expect(
      withTransaction(pool as never, async () => {
        throw new Error('audit write failed');
      }),
    ).rejects.toThrow('audit write failed');

    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.release).toHaveBeenCalledOnce();
  });

  it('reuses the outer connection for nested work on the same pool', async () => {
    const connection = transactionConnection();
    const pool = { getConnection: vi.fn().mockResolvedValue(connection) };

    await withTransaction(pool as never, async (outer) =>
      withTransaction(pool as never, async (inner) => {
        // 嵌套 work 拿到的是 tagged 门面（与原始连接不同对象），但绑定同一底层连接：
        // 经 inner 执行的查询落在 outer 同一 mock 上。
        expect(inner).not.toBe(outer);
        await inner.execute('SELECT 1');
        expect(connection.execute).toHaveBeenCalledWith('SELECT 1');
      }),
    );

    expect(pool.getConnection).toHaveBeenCalledOnce();
    expect(connection.beginTransaction).toHaveBeenCalledOnce();
    expect(connection.commit).toHaveBeenCalledOnce();
  });
});

describe('withActiveConnection', () => {
  it('reuses the active transaction connection inside withTransaction on the same pool', async () => {
    const connection = transactionConnection();
    const pool = { getConnection: vi.fn().mockResolvedValue(connection) };

    await withTransaction(pool as never, async (outer) =>
      withActiveConnection(pool as never, async (queryable) => {
        // 事务内拿到的是 tagged 门面：不是原始连接对象，但查询绑定到同一底层连接。
        expect(queryable).not.toBe(outer);
        await queryable.execute('SELECT 2');
        expect(connection.execute).toHaveBeenCalledWith('SELECT 2');
      }),
    );

    expect(pool.getConnection).toHaveBeenCalledOnce();
  });

  it('falls back to the pool itself outside a transaction without acquiring a connection', async () => {
    const pool = { getConnection: vi.fn() };
    await withActiveConnection(pool as never, async (queryable) => {
      expect(queryable).toBe(pool);
    });
    expect(pool.getConnection).not.toHaveBeenCalled();
  });
});

const transactionConnection = () => ({
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
  execute: vi.fn(),
  query: vi.fn(),
});
