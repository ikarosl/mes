import { describe, expect, it, vi } from 'vitest';
import { registerAfterCommit, withActiveConnection, withTransaction } from '../index.js';

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

  it('deduplicates nested after-commit hooks by key and dispatches them once', async () => {
    const connection = transactionConnection();
    const pool = { getConnection: vi.fn().mockResolvedValue(connection) };
    const runs: string[] = [];
    const outerRun = vi.fn(() => {
      runs.push('outer');
    });
    const innerRun = vi.fn(() => {
      runs.push('inner');
    });
    const secondRun = vi.fn(() => {
      runs.push('second');
    });
    const outerOnError = vi.fn();
    const innerOnError = vi.fn();

    await withTransaction(pool as never, async () => {
      registerAfterCommit(pool as never, 'notification:1', outerRun, outerOnError);

      await withTransaction(pool as never, async () => {
        registerAfterCommit(pool as never, 'notification:1', innerRun, innerOnError);
        registerAfterCommit(pool as never, 'notification:2', secondRun, vi.fn());
      });
    });

    expect(pool.getConnection).toHaveBeenCalledOnce();
    expect(connection.beginTransaction).toHaveBeenCalledOnce();
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.release).toHaveBeenCalledOnce();

    await flushAfterCommit();

    expect(runs).toEqual(['outer', 'second']);
    expect(outerRun).toHaveBeenCalledOnce();
    expect(innerRun).not.toHaveBeenCalled();
    expect(outerOnError).not.toHaveBeenCalled();
    expect(innerOnError).not.toHaveBeenCalled();
  });

  it('dispatches after commit hooks only after commit and release', async () => {
    const events: string[] = [];
    const connection = transactionConnection();
    connection.beginTransaction.mockImplementation(async () => {
      events.push('begin');
    });
    connection.commit.mockImplementation(async () => {
      events.push('commit');
    });
    connection.release.mockImplementation(() => {
      events.push('release');
    });
    const pool = { getConnection: vi.fn().mockResolvedValue(connection) };
    const run = vi.fn(() => {
      events.push('hook');
    });

    await withTransaction(pool as never, async () => {
      registerAfterCommit(pool as never, 'notification:1', run, vi.fn());
    });

    expect(events).toEqual(['begin', 'commit', 'release']);
    expect(run).not.toHaveBeenCalled();

    await flushAfterCommit();

    expect(events).toEqual(['begin', 'commit', 'release', 'hook']);
    expect(run).toHaveBeenCalledOnce();
  });

  it('discards after-commit hooks when work rolls back', async () => {
    const connection = transactionConnection();
    const pool = { getConnection: vi.fn().mockResolvedValue(connection) };
    const run = vi.fn();
    const onError = vi.fn();

    await expect(
      withTransaction(pool as never, async () => {
        registerAfterCommit(pool as never, 'notification:rollback', run, onError);
        throw new Error('work failed');
      }),
    ).rejects.toThrow('work failed');

    await flushAfterCommit();

    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.release).toHaveBeenCalledOnce();
    expect(run).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('discards after-commit hooks when commit fails', async () => {
    const connection = transactionConnection();
    connection.commit.mockRejectedValue(new Error('commit failed'));
    const pool = { getConnection: vi.fn().mockResolvedValue(connection) };
    const run = vi.fn();
    const onError = vi.fn();

    await expect(
      withTransaction(pool as never, async () => {
        registerAfterCommit(pool as never, 'notification:commit-failure', run, onError);
      }),
    ).rejects.toThrow('提交数据库事务失败');

    await flushAfterCommit();

    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.release).toHaveBeenCalledOnce();
    expect(run).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('isolates synchronous and asynchronous hook failures from other hooks', async () => {
    const connection = transactionConnection();
    const pool = { getConnection: vi.fn().mockResolvedValue(connection) };
    const syncError = new Error('sync hook failed');
    const asyncError = new Error('async hook failed');
    const syncRun = vi.fn(() => {
      throw syncError;
    });
    const asyncRun = vi.fn(async () => {
      throw asyncError;
    });
    const syncOnError = vi.fn(() => {
      throw new Error('sync error handler failed');
    });
    const asyncOnError = vi.fn();
    const successfulRun = vi.fn();

    await withTransaction(pool as never, async () => {
      registerAfterCommit(pool as never, 'notification:sync-failure', syncRun, syncOnError);
      registerAfterCommit(pool as never, 'notification:async-failure', asyncRun, asyncOnError);
      registerAfterCommit(pool as never, 'notification:success', successfulRun, vi.fn());
    });

    await flushAfterCommit();

    expect(syncRun).toHaveBeenCalledOnce();
    expect(asyncRun).toHaveBeenCalledOnce();
    expect(syncOnError).toHaveBeenCalledOnce();
    expect(asyncOnError).toHaveBeenCalledOnce();
    expect(successfulRun).toHaveBeenCalledOnce();
  });

  it('does not let a hook inherit an outer transaction connection', async () => {
    const outerConnection = transactionConnection();
    const innerConnection = transactionConnection();
    const outerPool = { getConnection: vi.fn().mockResolvedValue(outerConnection) };
    const innerPool = { getConnection: vi.fn().mockResolvedValue(innerConnection) };
    let observed: unknown;
    let registrationError: unknown;
    let finishHook!: () => void;
    const hookFinished = new Promise<void>((resolve) => {
      finishHook = resolve;
    });

    await withTransaction(outerPool as never, async () => {
      await withTransaction(innerPool as never, async () => {
        registerAfterCommit(
          innerPool as never,
          'notification:inner',
          async () => {
            await withActiveConnection(outerPool as never, async (queryable) => {
              observed = queryable;
            });
            try {
              registerAfterCommit(outerPool as never, 'notification:late', vi.fn(), vi.fn());
            } catch (error) {
              registrationError = error;
            }
            finishHook();
          },
          vi.fn(),
        );
      });

      await hookFinished;
    });

    expect(observed).toBe(outerPool);
    expect(registrationError).toBeInstanceOf(Error);
    expect(outerConnection.release).toHaveBeenCalledOnce();
    expect(innerConnection.release).toHaveBeenCalledOnce();
  });

  it('drops hooks from a failed transaction attempt when the caller retries', async () => {
    const firstConnection = transactionConnection();
    const secondConnection = transactionConnection();
    const pool = {
      getConnection: vi
        .fn()
        .mockResolvedValueOnce(firstConnection)
        .mockResolvedValueOnce(secondConnection),
    };
    const hookAttempts: number[] = [];
    let attempt = 0;

    const executeAttempt = () =>
      withTransaction(pool as never, async () => {
        const currentAttempt = ++attempt;
        registerAfterCommit(
          pool as never,
          'notification:retry',
          () => {
            hookAttempts.push(currentAttempt);
          },
          vi.fn(),
        );
        if (currentAttempt === 1) throw new Error('transient failure');
        return currentAttempt;
      });

    await expect(executeAttempt()).rejects.toThrow('transient failure');
    await expect(executeAttempt()).resolves.toBe(2);

    await flushAfterCommit();

    expect(hookAttempts).toEqual([2]);
    expect(firstConnection.rollback).toHaveBeenCalledOnce();
    expect(secondConnection.commit).toHaveBeenCalledOnce();
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

const flushAfterCommit = () => new Promise<void>((resolve) => setImmediate(resolve));
