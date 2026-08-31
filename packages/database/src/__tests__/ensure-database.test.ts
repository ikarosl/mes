import { describe, expect, it, vi } from 'vitest';
import { ensureDatabaseExists } from '../ensure-database.js';

describe('ensureDatabaseExists', () => {
  it('creates the configured database only when it is missing', async () => {
    const query = vi.fn().mockResolvedValue(undefined);
    const connection = { query } as never;

    await ensureDatabaseExists(connection, 'easy_mes');

    expect(query).toHaveBeenCalledWith(
      'CREATE DATABASE IF NOT EXISTS ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci',
      ['easy_mes'],
    );
  });

  it('rejects an empty database name before touching the connection', async () => {
    const query = vi.fn();
    const connection = { query } as never;

    await expect(ensureDatabaseExists(connection, '   ')).rejects.toThrow('DB_NAME 为必填项');
    expect(query).not.toHaveBeenCalled();
  });
});
