import { describe, expect, it, vi } from 'vitest';
import { withTransaction } from '../index.js';

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
        expect(inner).toBe(outer);
      }),
    );

    expect(pool.getConnection).toHaveBeenCalledOnce();
    expect(connection.beginTransaction).toHaveBeenCalledOnce();
    expect(connection.commit).toHaveBeenCalledOnce();
  });
});

const transactionConnection = () => ({
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
});
